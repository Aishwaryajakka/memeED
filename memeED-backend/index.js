import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT || 8080;
const USE_WEAVIATE = String(process.env.USE_WEAVIATE || "false") === "true";
const USE_LLM = String(process.env.USE_LLM || "false") === "true";

import weaviate, { ApiKey } from "weaviate-ts-client";

// -------- Optional LLM (you can keep USE_LLM=false) ----------
import OpenAI from "openai";
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

async function genHookLLM(topic, style) {
  if (!openai) throw new Error("OPENAI_API_KEY missing");
  const prompt = `Create a ${style} style, 1–2 sentence engaging hook for teaching "${topic}" to middle/high school students. Keep it classroom-appropriate, vivid, and fun.`;
  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7
  });
  return r.choices[0].message.content.trim();
}

async function genQuizLLM(topic, level) {
  if (!openai) throw new Error("OPENAI_API_KEY missing");
  const prompt = `Create 3 multiple-choice questions about "${topic}" for ${level} level students. 
Return JSON array of objects with keys: question, choices (array of 4), answer (exact string).`;
  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7
  });
  // try to parse JSON from the model
  const text = r.choices[0].message.content;
  try { return JSON.parse(text); } catch { return []; }
}

// --------------- Fallback (no LLM) ----------------
const hookTemplate = (topic, style = "meme") => {
  const styles = {
    meme: (t) => `If ${t} were a meme: “Sun hits leaf — *PhotosynTHIS!* 🌞➡️🔋”`,
    analogy: (t) => `${t} is like a factory: inputs in, energy out, waste managed.`,
    story: (t) => `Imagine you're a ${t} manager on a spaceship keeping the crew energized…`
  };
  return (styles[style] || styles.meme)(topic);
};

const quizTemplate = (topic, level = "easy") => ([
  {
    question: `Which statement best describes ${topic}?`,
    choices: ["Definition A", "Definition B", "Definition C", "Definition D"],
    answer: "Definition B",
    difficulty: level
  },
  {
    question: `Which is NOT related to ${topic}?`,
    choices: ["X", "Y", "Z", "Totally unrelated thing"],
    answer: "Totally unrelated thing",
    difficulty: level
  },
  {
    question: `Which analogy fits ${topic} the best?`,
    choices: ["Factory", "Concert", "Desert", "Random"],
    answer: "Factory",
    difficulty: level
  }
]);

// --------------- Storage Layer (switchable) ---------------
let memHooks = [];     // used when USE_WEAVIATE=false
let memQuizItems = [];

let weavClient = null;
async function ensureWeaviate() {
  if (!USE_WEAVIATE) return;
  const host = (process.env.WEAVIATE_URL || "").replace(/^https?:\/\//, "");
  weavClient = weaviate.client({
    scheme: "https",
    host,
    apiKey: new ApiKey(process.env.WEAVIATE_API_KEY || ""),
    headers: process.env.OPENAI_API_KEY
      ? { "X-OpenAI-Api-Key": process.env.OPENAI_API_KEY }
      : {}
  });

  const schema = await weavClient.schema.getter().do();
  const have = (name) => schema.classes?.some((c) => c.class === name);

  if (!have("Hook")) {
    await weavClient.schema.classCreator().withClass({
      class: "Hook",
      vectorizer: "text2vec-openai",
      properties: [
        { name: "topic", dataType: ["text"] },
        { name: "style", dataType: ["text"] },
        { name: "text", dataType: ["text"] },
        { name: "tags", dataType: ["text[]"] }
      ]
    }).do();
  }
  if (!have("QuizItem")) {
    await weavClient.schema.classCreator().withClass({
      class: "QuizItem",
      vectorizer: "text2vec-openai",
      properties: [
        { name: "topic", dataType: ["text"] },
        { name: "question", dataType: ["text"] },
        { name: "choices", dataType: ["text[]"] },
        { name: "answer", dataType: ["text"] },
        { name: "difficulty", dataType: ["text"] }
      ]
    }).do();
  }
}

// --------------- App ----------------
const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => res.json({ ok: true, useWeaviate: USE_WEAVIATE }));

// Create Hook
app.post("/api/hook", async (req, res) => {
  const { topic, style = "meme" } = req.body || {};
  if (!topic) return res.status(400).json({ error: "topic is required" });

  let text;
  try {
    text = USE_LLM ? await genHookLLM(topic, style) : hookTemplate(topic, style);
  } catch (e) {
    console.error(e);
    text = hookTemplate(topic, style);
  }

  if (USE_WEAVIATE) {
    try {
      const obj = await weavClient.data.creator()
        .withClassName("Hook")
        .withProperties({ topic, style, text, tags: [style, "education", "hook"] })
        .do();
      return res.json({ hook: text, id: obj.id });
    } catch (e) {
      console.error("Weaviate create Hook failed:", e.message);
      // fall back to memory if needed
    }
  }

  const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  memHooks.push({ id, topic, style, text, tags: [style, "education", "hook"] });
  res.json({ hook: text, id });
});

// Create Quiz
app.post("/api/quiz", async (req, res) => {
  const { topic, level = "easy" } = req.body || {};
  if (!topic) return res.status(400).json({ error: "topic is required" });

  let items = [];
  try {
    items = USE_LLM ? await genQuizLLM(topic, level) : quizTemplate(topic, level);
  } catch (e) {
    console.error(e);
    items = quizTemplate(topic, level);
  }

  if (USE_WEAVIATE) {
    try {
      const created = await Promise.all(
        items.map(it => weavClient.data.creator()
          .withClassName("QuizItem")
          .withProperties({ topic, difficulty: level, ...it })
          .do()
        )
      );
      return res.json({ items, ids: created.map(c => c.id) });
    } catch (e) {
      console.error("Weaviate create Quiz failed:", e.message);
      // fall back to memory
    }
  }

  const ids = items.map(() => `mem-${Date.now()}-${Math.random().toString(36).slice(2,7)}`);
  items.forEach((it, i) => memQuizItems.push({ id: ids[i], topic, difficulty: level, ...it }));
  res.json({ items, ids });
});

// Semantic-ish search (Weaviate nearText if available; fallback substring)
app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ hooks: [] });

  if (USE_WEAVIATE) {
    try {
      const r = await weavClient.graphql.get()
        .withClassName("Hook")
        .withFields("topic style text tags _additional { distance }")
        .withNearText({ concepts: [q] })
        .withLimit(10)
        .do();
      return res.json({ hooks: r.data.Get.Hook || [] });
    } catch (e) {
      console.error("Weaviate search failed:", e.message);
      // fall back to memory
    }
  }

  const hits = memHooks.filter(h =>
    (h.text || "").toLowerCase().includes(q.toLowerCase()) ||
    (h.topic || "").toLowerCase().includes(q.toLowerCase())
  ).slice(0, 10);
  res.json({ hooks: hits });
});

app.listen(PORT, async () => {
  if (USE_WEAVIATE) {
    try {
      await ensureWeaviate();
      console.log(`Weaviate connected. Backend on :${PORT}`);
    } catch (e) {
      console.error("Weaviate init failed, using memory store.", e.message);
    }
  }
  console.log(`memeED API running on http://localhost:${PORT}`);
});

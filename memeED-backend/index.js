// ===== imports & env =====
import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import weaviate, { ApiKey } from "weaviate-ts-client";
import OpenAI from "openai";

// ===== config =====
const PORT = process.env.PORT || 8080;
const USE_WEAVIATE = String(process.env.USE_WEAVIATE || "false") === "true";
const VECTORIZER = process.env.VECTORIZER || "text2vec-weaviate";
const USE_LLM = String(process.env.USE_LLM || "false") === "true";
const PERSIST_ASK = String(process.env.PERSIST_ASK || "false") === "true";

// ===== app =====
const app = express();
app.use(cors());
app.use(express.json());

// ----- health check -----
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ===== GraphRAG export loader =====
const GEXPORT_DIR = process.env.GRAPH_INDEX_DIR
  ? path.resolve(process.cwd(), process.env.GRAPH_INDEX_DIR)
  : path.resolve(process.cwd(), "graphrag_export");

let GR_GRAPH = null, GR_COMMS = null;
try {
  GR_GRAPH = JSON.parse(fs.readFileSync(path.join(GEXPORT_DIR, "graph.json"), "utf-8"));
  GR_COMMS = JSON.parse(fs.readFileSync(path.join(GEXPORT_DIR, "communities.json"), "utf-8"));
  console.log("GraphRAG export loaded from:", GEXPORT_DIR);
} catch (e) {
  console.log("GraphRAG export not found at", GEXPORT_DIR, "— endpoints will return empty.");
}

// ----- debug route for GraphRAG -----
app.get("/api/debug/graphrag", (_req, res) => {
  res.json({
    dir: GEXPORT_DIR,
    nodes: GR_GRAPH?.nodes?.length || 0,
    edges: GR_GRAPH?.edges?.length || 0,
    communities: GR_COMMS?.communities?.length || 0
  });
});

// ===== Weaviate client (initialized in ensureWeaviate) =====
let weavClient = null;

// ===== Optional LLM =====
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ===== helpers =====
function safeJSON(text) {
  try {
    const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : JSON.parse(text);
  } catch { return []; }
}

function canonTopic(s = "") {
  return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function inferFromNL(q) {
  const s = (q || "").toLowerCase();
  const styleMap = [
    ["meme", "meme", "funny", "joke"],
    ["analogy", "analogy", "compare", "like", "as if"],
    ["story", "story", "narrative", "imagine"],
  ];
  let style = "meme";
  for (const [name, ...keys] of styleMap) {
    if (keys.some(k => s.includes(k))) { style = name; break; }
  }
  const m = s.match(/\b(?:for|about|on|regarding|re[:]?)\s+(.+)/i);
  const topic = (m ? m[1] : s)
    .replace(/^(make|create|generate|write)\b.*?\b(?:for|about|on)\b/i, "")
    .replace(/^\s*an?\s+/i, "")
    .replace(/\s+please.*$/i, "")
    .replace(/[.?!]$/,"")
    .trim();
  return { topic: topic || q, style };
}

function getGraphContext(query, max = 3) {
  if (!GR_COMMS && !GR_GRAPH) return { snippets: [] };
  const q = String(query || "").toLowerCase();
  const snippets = [];

  if (GR_COMMS?.communities?.length) {
    for (const c of GR_COMMS.communities) {
      const hay = `${c.title || ""} ${c.summary || ""}`.toLowerCase();
      if (hay.includes(q) && snippets.length < max) {
        snippets.push((c.summary || c.title || "").slice(0, 500));
      }
    }
  }
  if (snippets.length < max && GR_GRAPH?.nodes?.length) {
    for (const n of GR_GRAPH.nodes) {
      const hay = `${n.title || ""}`.toLowerCase();
      if (hay.includes(q) && snippets.length < max) {
        snippets.push((n.title || "").slice(0, 140));
      }
    }
  }
  return { snippets };
}

async function getWeaviateGrounding(q, limit = 3) {
  if (!USE_WEAVIATE || !weavClient) return [];
  try {
    const r = await weavClient.graphql
      .get()
      .withClassName("Hook")
      .withHybrid({ query: q, alpha: 0.5 })
      .withFields("text topic style tags _additional { distance }")
      .withLimit(limit)
      .do();
    const arr = r?.data?.Get?.Hook || [];
    return arr.map(o => o.text || o.topic || "").filter(Boolean).slice(0, limit);
  } catch (e) {
    console.error("Weaviate grounding error:", e.message);
    return [];
  }
}

// ===== LLM generators =====
async function genHookLLM(topic, style, graphBits = [], weavBits = []) {
  if (!openai) throw new Error("OPENAI_API_KEY missing");
  const sys = `You generate short, classroom-appropriate hooks (1–2 sentences) for middle/high school lessons. Use vivid, fun language. Respect age-appropriate tone.`;
  const guidance = [
    graphBits.length ? `Graph context:\n- ${graphBits.join("\n- ")}` : null,
    weavBits.length ? `Related hooks/snippets:\n- ${weavBits.join("\n- ")}` : null,
  ].filter(Boolean).join("\n\n");
  const user = `Create a ${style} style hook for topic "${topic}". If possible, weave in ideas from the context below without quoting verbatim.\n\n${guidance || "(No extra context)"}\nOutput: 1–2 sentences only.`;
  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    temperature: 0.8,
  });
  return (r.choices?.[0]?.message?.content || "").trim();
}

async function genQuizLLM(topic, level) {
  if (!openai) throw new Error("OPENAI_API_KEY missing");
  const prompt = `Create 3 multiple-choice questions about "${topic}" for ${level} level students. Return JSON array of objects with keys: question, choices (array of 4), answer (exact string).`;
  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7
  });
  const text = r.choices[0].message.content || "[]";
  return safeJSON(text);
}

// ===== Fallback generators =====
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

// ===== In-memory store (used when USE_WEAVIATE=false) =====
let memHooks = [];
let memQuizItems = [];

// ===== Weaviate schema init =====
async function ensureWeaviate() {
  if (!USE_WEAVIATE) return;

  const host = (process.env.WEAVIATE_URL || "").replace(/^https?:\/\//, "");
  console.log("Pinging Weaviate:", host);
  try {
    const ping = await fetch(`https://${host}/v1/.well-known/ready`);
    console.log("Weaviate ready status:", ping.status);
  } catch (e) {
    console.error("Weaviate readiness check failed:", e.message);
    throw e;
  }

  weavClient = weaviate.client({
    scheme: "https",
    host,
    apiKey: new ApiKey(process.env.WEAVIATE_API_KEY || ""),
    headers:
      VECTORIZER === "text2vec-openai" && process.env.OPENAI_API_KEY
        ? { "X-OpenAI-Api-Key": process.env.OPENAI_API_KEY }
        : {},
  });

  const schema = await weavClient.schema.getter().do();
  const have = (name) => schema.classes?.some((c) => c.class === name);
  const cls = schema.classes?.find(c => c.class === "Hook");

  if (cls && cls.vectorizer !== "text2vec-openai") {
    console.warn("Resetting Hook class to use text2vec-openai (this will delete all Hook objects)");
    await weavClient.schema.classDeleter().withClassName("Hook").do();
  }

  if (!have("Hook")) {
    await weavClient.schema.classCreator().withClass({
      class: "Hook",
      vectorizer: "text2vec-openai",
      moduleConfig: { "text2vec-openai": { model: "text-embedding-3-small" } },
      properties: [
        { name: "topic", dataType: ["text"] },
        { name: "topicCanonical", dataType: ["text"] },
        { name: "style", dataType: ["text"] },
        { name: "text",  dataType: ["text"] },
        { name: "tags",  dataType: ["text[]"] },
        { name: "graphSignals", dataType: ["text[]"] },
        { name: "weavSignals",  dataType: ["text[]"] },
      ],
    }).do();
  } else {
    // add missing properties if needed
    const haveProp = (p) => (cls.properties || []).some(x => x.name === p);
    const addProp = async (name, dt) => {
      await weavClient.schema.propertyCreator()
        .withClassName("Hook")
        .withProperty({ name, dataType: [dt] })
        .do();
    };
    if (!haveProp("topicCanonical")) await addProp("topicCanonical", "text");
    if (!haveProp("graphSignals")) await addProp("graphSignals", "text[]");
    if (!haveProp("weavSignals"))  await addProp("weavSignals",  "text[]");
  }

  if (!have("QuizItem")) {
    await weavClient.schema.classCreator().withClass({
      class: "QuizItem",
      vectorizer: VECTORIZER,
      properties: [
        { name: "topic", dataType: ["text"] },
        { name: "question", dataType: ["text"] },
        { name: "choices",  dataType: ["text[]"] },
        { name: "answer",   dataType: ["text"] },
        { name: "difficulty", dataType: ["text"] },
      ],
    }).do();
  }

  console.log("✅ Weaviate schema ready");
}

// ===== GraphRAG routes =====
app.get("/api/graphrag/community", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  if (!GR_COMMS) return res.json({ summaries: [] });

  let summaries = [];
  if (GR_COMMS?.communities?.length) {
    summaries = (GR_COMMS.communities || [])
      .filter(c =>
        (c.title || "").toLowerCase().includes(q) ||
        (c.summary || "").toLowerCase().includes(q)
      )
      .slice(0, 3)
      .map(c => (c.summary || c.title || "").slice(0, 280));
  }

  res.json({ summaries });
});

app.get("/api/graphrag/graph", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  if (!GR_GRAPH) return res.json({ nodes: [], edges: [] });

  const nodes = GR_GRAPH.nodes.filter(n =>
    (n.title || "").toLowerCase().includes(q)
  );
  const ids = new Set(nodes.map(n => n.id));
  const edges = GR_GRAPH.edges.filter(e => ids.has(e.source) || ids.has(e.target));
  res.json({ nodes, edges });
});

// ===== Core routes =====

// Create Hook
app.post("/api/hook", async (req, res) => {
  const { topic, style = "meme" } = req.body || {};
  if (!topic) return res.status(400).json({ error: "topic is required" });

  try {
    const graphCtx = getGraphContext(topic, 3).snippets;
    const weavCtx  = await getWeaviateGrounding(topic, 3);

    let text;
    if (USE_LLM) {
      text = await genHookLLM(topic, style, graphCtx, weavCtx);
      if (!text) text = hookTemplate(topic, style);
    } else {
      text = hookTemplate(topic, style);
    }

    let id = null;
    if (USE_WEAVIATE && weavClient) {
      try {
        const obj = await weavClient.data.creator()
          .withClassName("Hook")
          .withProperties({
            topic,
            topicCanonical: canonTopic(topic),
            style,
            text,
            tags: [style, "education", "hook"],
            graphSignals: graphCtx,
            weavSignals: weavCtx
          })
          .do();
        id = obj?.id || null;
      } catch (e) {
        console.error("Weaviate create Hook failed:", e.message);
      }
    } else {
      id = `mem-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      memHooks.push({ id, topic, style, text, tags: [style, "education", "hook"] });
    }

    return res.json({
      id,
      hook: text,
      context: {
        graphrag_used: Boolean(graphCtx.length),
        weaviate_used: Boolean(weavCtx.length),
        graph_snippets: graphCtx,
        weaviate_snippets: weavCtx
      }
    });
  } catch (e) {
    console.error("Hook generation error:", e);
    const text = hookTemplate(topic, style);
    return res.json({
      id: null,
      hook: text,
      context: { graphrag_used: false, weaviate_used: false, graph_snippets: [], weaviate_snippets: [] },
      warning: e.message
    });
  }
});

// Natural-language Ask (optionally persist)
app.post("/api/ask", async (req, res) => {
  const { q } = req.body || {};
  if (!q) return res.status(400).json({ error: "q is required" });

  const { topic, style } = inferFromNL(q);
  if (!topic) return res.json({ intent: "unknown", hook: null });

  try {
    const graphCtx = getGraphContext(topic, 3).snippets;
    const weavCtx  = await getWeaviateGrounding(topic, 3);

    let text = USE_LLM
      ? (await genHookLLM(topic, style, graphCtx, weavCtx)) || hookTemplate(topic, style)
      : hookTemplate(topic, style);

    let id = null;
    if (PERSIST_ASK && USE_WEAVIATE && weavClient) {
      try {
        const obj = await weavClient.data.creator()
          .withClassName("Hook")
          .withProperties({
            topic,
            topicCanonical: canonTopic(topic),
            style,
            text,
            tags: [style, "education", "hook"]
          })
          .do();
        id = obj?.id || null;
      } catch (e) { console.error("Weaviate create from /api/ask failed:", e.message); }
    }

    return res.json({
      intent: "generate",
      topic, style,
      id, hook: text,
      context: {
        graphrag_used: Boolean(graphCtx.length),
        weaviate_used: Boolean(weavCtx.length),
        graph_snippets: graphCtx,
        weaviate_snippets: weavCtx
      }
    });
  } catch (e) {
    console.error("ask error:", e);
    return res.json({ intent: "error", hook: null, error: e.message });
  }
});

// Strict topic search: single on-topic result
app.get("/api/search", async (req, res) => {
  const raw = String(req.query.q || "").trim();
  if (!raw) return res.json({ hooks: [] });

  const { topic, style } = inferFromNL(raw);
  const tcanon = canonTopic(topic || raw);
  if (!tcanon) return res.json({ hooks: [] });

  if (USE_WEAVIATE && weavClient) {
    try {
      const operands = [
        { path: ["topicCanonical"], operator: "Like", valueText: `*${tcanon}*` },
      ];
      if (["meme", "analogy", "story"].includes((style || "").toLowerCase())) {
        operands.push({ path: ["style"], operator: "Equal", valueText: style.toLowerCase() });
      }

      const r = await weavClient.graphql
        .get()
        .withClassName("Hook")
        .withWhere({ operator: "And", operands })
        .withHybrid({ query: topic || raw, alpha: 0.1, properties: ["topic", "text"] })
        .withFields("topic style text tags _additional { distance }")
        .withLimit(1)
        .do();

      const hooks = r?.data?.Get?.Hook || [];
      return res.json({ hooks });
    } catch (e) {
      console.error("Weaviate search failed:", e.message);
    }
  }

  // memory fallback
  const qcanon = tcanon;
  let hits = memHooks.filter(h => canonTopic(h.topic).includes(qcanon));
  if (style) hits = hits.filter(h => (h.style || "").toLowerCase() === style.toLowerCase());
  hits = hits.slice(0, 1);
  res.json({ hooks: hits });
});

// ===== start server =====
(async () => {
  if (USE_WEAVIATE) {
    try {
      await ensureWeaviate();
    } catch (e) {
      console.error("Weaviate init failed; falling back to memory:", e.message);
      weavClient = null;
    }
  }
  app.listen(PORT, () => {
    console.log(`memeED API running on http://localhost:${PORT} (weaviate: ${!!weavClient})`);
  });
})();

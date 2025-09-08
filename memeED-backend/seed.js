import * as dotenv from "dotenv";
dotenv.config();

import weaviate, { ApiKey } from "weaviate-ts-client";

const USE_WEAVIATE = String(process.env.USE_WEAVIATE || "false") === "true";

const seeds = [
  { topic: "photosynthesis", style: "meme", text: "Plants: turning ☀️ into 🍃 power—solar panels with vibes.", tags:["seed"] },
  { topic: "algebra fractions", style: "analogy", text: "Fractions are pizza slices—same pizza, different cut sizes.", tags:["seed"] },
  { topic: "gravity", style: "story", text: "You’re an astronaut; everything floats—until gravity says ‘come home.’", tags:["seed"] },
];

if (!USE_WEAVIATE) {
  console.log("USE_WEAVIATE=false — run the app to collect data in memory by generating hooks.");
  process.exit(0);
}

const host = (process.env.WEAVIATE_URL || "").replace(/^https?:\/\//, "");
const client = weaviate.client({
  scheme: "https",
  host,
  apiKey: new ApiKey(process.env.WEAVIATE_API_KEY || ""),
  headers: process.env.OPENAI_API_KEY ? { "X-OpenAI-Api-Key": process.env.OPENAI_API_KEY } : {}
});


(async () => {
  for (const s of seeds) {
    await client.data.creator().withClassName("Hook").withProperties(s).do();
    console.log("Seeded:", s.topic);
  }
  console.log("Done.");
  process.exit(0);
})();

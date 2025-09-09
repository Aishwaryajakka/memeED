# memeED — Turn any topic into a meme-style hook + instant quiz

## 🚀 Elevator Pitch
Teachers type “funny meme for gravity” or “story hook for algebra functions” and instantly get a short, classroom-safe hook plus a quick 3-question quiz.  
Under the hood we blend **GraphRAG** (curriculum graph), **Weaviate** (vector + hybrid search), and an **LLM** to keep outputs on-topic, reusable, and fast.

---

## ✨ Why This Matters
- **Class openers are hard** → Teachers spend time crafting “hooks” to grab attention.  
- **Context makes hooks better** → Hooks grounded in curriculum concepts land better than generic jokes.  
- **Reuse is gold** → Storing hooks lets teachers search and repurpose later.  

**memeED solves all three with a tiny stack you can run locally.**

---

## 🧠 What It Does
- Generate hooks in styles: meme, analogy, or story.  
- Instant quiz (3 MCQs).  
- Natural-language ask: “funny meme for cell division” → auto-detects topic/style.  
- Store & search hooks with Weaviate (hybrid search).  
- GraphRAG grounding: injects snippets from curriculum graph to keep outputs accurate.

---

## 🏗️ How It Works (Architecture)
```
React UI  ──▶  Express API
                ├── /api/hook (generate + persist)
                ├── /api/quiz (MCQs)
                ├── /api/ask (NL to topic/style + generate)
                ├── /api/search (strict retrieval)
                ├── /api/graphrag/* (graph snippets)
                └── /api/health
                         │
                         ├── GraphRAG export (JSON on disk)
                         └── Weaviate (WCS/local) + OpenAI vectorizer
```

**Pipeline**
1. GraphRAG grounding → pull 1–3 snippets.  
2. Weaviate hybrid grounding → withHybrid({ query, alpha: 0.5 }).  
3. LLM compose → GPT-4o-mini creates classroom-safe hook.  
4. Persist in Weaviate.  
5. Strict search via topicCanonical.

---

## 🧰 Tech Stack
- **Frontend**: React + Vite  
- **Backend**: Node/Express (ESM)  
- **Vector DB**: Weaviate (OpenAI text2vec)  
- **LLM**: OpenAI GPT-4o-mini  
- **GraphRAG**: static JSON export (communities + nodes)

---

## 🚀 Run It Locally
```bash
# Clone
git clone https://github.com/Aishwaryajakka/memeED
cd memeED

# Backend
cd memeED-backend
cp .env.example .env
# fill in keys/URLs
npm i
npm start  # runs at http://localhost:8080

# Frontend
cd ../memeED-frontend
cp .env.example .env
# VITE_API_BASE=http://localhost:8080
npm i
npm run dev  # runs at http://localhost:5173
```

**Backend env vars** (`memeED-backend/.env`):
```env
PORT=8080
USE_WEAVIATE=true
WEAVIATE_URL=<your-wcs-host>.weaviate.cloud
WEAVIATE_API_KEY=<wcs-key>
VECTORIZER=text2vec-openai
OPENAI_API_KEY=sk-...
GRAPH_INDEX_DIR=./graphrag_export
USE_LLM=true
PERSIST_ASK=false
```

GraphRAG export folder must include:
- `communities.json`
- `graph.json`

---

## 🧪 Try These
- **Hook**: photosynthesis, meme → “Sun hits leaf — PhotosynTHIS!”  
- **Ask**:  
  - “funny meme for gravity”  
  - “story opener for algebra functions”  
- **Search**: “meme for photosynthesis” (retrieves strict on-topic result).

---

## 🧩 API Reference
- `GET /api/health` → { ok: true }  
- `POST /api/hook` → { id, hook, context }  
- `POST /api/quiz` → { items }  
- `POST /api/ask` → { intent, topic, style, hook }  
- `GET /api/search?q=...` → { hooks }  
- `GET /api/graphrag/community?q=...`  
- `GET /api/graphrag/graph?q=...`  
- `GET /api/debug/graphrag`  

---

## 🔎 Where Weaviate & GraphRAG Come In
**Weaviate**
- Stores: hooks (topicCanonical, style, tags).  
- Reads: hybrid search (BM25 + vectors) and strict search.  

**GraphRAG**
- Pre-export JSON → no infra.  
- Injects summaries/titles as soft grounding to LLM.  

---

## 🎯 Use Cases
- Bell-ringer hooks.  
- Exit tickets & Do-Now.  
- Remediation/differentiation with different styles.  
- Curriculum authoring & reuse.  
- PD workshops & outreach.  

---

## 🧯 Troubleshooting
- **Weaviate ECONNREFUSED** → check URL/API key.  
- **GraphRAG empty** → ensure JSON files exist.  
- **Extra/old topics** → regenerate hooks (strict topicCanonical).  
- **CORS** → frontend .env must point to backend.  

---

## 🗺️ Roadmap
- Backfill for topicCanonical.  
- Standards-aware tagging.  
- Image meme rendering.  
- Teacher accounts + shared libraries.  

---

## 🧑‍💻 Credits
Built at Hack Day by **memeED**.  
Thanks to open-source GraphRAG ideas + Weaviate community.

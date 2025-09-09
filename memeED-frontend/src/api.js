// src/api.js (FRONTEND)
// Do NOT import express/cors in the frontend.

import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:8080",
  timeout: 20000,
});

// GraphRAG (communities)
export const graphCommunities = (q) =>
  api.get("/api/graphrag/community", { params: { q } }).then((r) => r.data);

// Generate hook
export const createHook = (payload) =>
  api.post("/api/hook", payload).then((r) => r.data);

// Generate quiz
export const createQuiz = (payload) =>
  api.post("/api/quiz", payload).then((r) => r.data);

// Vector search existing hooks
export const searchHooks = (q) =>
  api.get("/api/search", { params: { q } }).then((r) => r.data);

// Natural-language “Ask” → generates a hook
export const askNL = (q) =>
  api.post("/api/ask", { q }).then((r) => r.data);

export default api;

import axios from "axios";
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:8080",
  timeout: 20000,
});
export const createHook = (payload) => api.post("/api/hook", payload).then(r => r.data);
export const createQuiz = (payload) => api.post("/api/quiz", payload).then(r => r.data);
export const searchHooks = (q) => api.get("/api/search", { params: { q } }).then(r => r.data);
export default api;

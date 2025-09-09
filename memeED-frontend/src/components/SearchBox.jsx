import { useState } from "react";
import { askNL, searchHooks } from "../api";

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [gen, setGen] = useState(null);
  const [hits, setHits] = useState([]);

  async function onSearch(e) {
    e.preventDefault();
    setLoading(true);
    setGen(null);
    setHits([]);

    let genRes = null;
    try {
      genRes = await askNL(q);
      if (genRes?.hook) setGen(genRes);
    } catch (err) {
      console.error("askNL error:", err);
    }

    try {
      const data = await searchHooks(q);
      let hooks = data?.hooks || [];

      // hide the Ask result if identical
      if (genRes?.hook) {
        const genTxt = genRes.hook.trim();
        hooks = hooks.filter(h => (h.text || "").trim() !== genTxt);
      }

      // show only ONE on-topic result
      hooks = hooks.slice(0, 1);

      setHits(hooks);
    } catch (err) {
      console.error("searchHooks error:", err);
    }

    setLoading(false);
  }

  return (
    <section className="space-y-3">
      <div className="font-semibold">Ask in natural language</div>

      <form onSubmit={onSearch} className="grid gap-2 md:grid-cols-[1fr,120px]">
        <input
          className="border rounded p-2"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="funny meme for algebra functions"
        />
        <button className="bg-black text-white rounded px-4" disabled={!q || loading}>
          {loading ? "Thinking…" : "Search"}
        </button>
      </form>

      {gen && (
        <div className="border rounded p-3">
          <div className="text-xs text-gray-500 mb-1">
            {gen.topic} · {gen.style}
          </div>
          <div>{gen.hook}</div>
        </div>
      )}

      {hits?.length > 0 && (
        <div className="space-y-2">
          {hits.map((h, i) => (
            <div key={i} className="border rounded p-3">
              <div className="text-xs text-gray-500 mb-1">
                {h.topic} · {h.style}
              </div>
              <div>{h.text}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

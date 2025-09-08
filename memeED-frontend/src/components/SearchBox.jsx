import { useState } from "react";
import { searchHooks } from "../api";
import { graphCommunities } from "../api";

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(false);

  const onSearch = async () => {
    setLoading(true);
    try {
      const [weav, comms] = await Promise.all([
        searchHooks(q),
        graphCommunities(q)
      ]);
      setResults(weav.hooks || []);
      setSummaries(comms.summaries || []);
    } catch (e) {
      alert("Search failed.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="font-semibold">Ask in natural language</div>
      <div className="flex gap-2">
        <input
          className="border rounded-xl px-3 py-2 flex-1"
          placeholder='e.g., "funny meme hook for algebra fractions"'
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button onClick={onSearch} className="px-4 py-2 rounded-xl border">
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <div key={i} className="p-4 rounded-2xl border bg-white">
              <div className="text-xs text-gray-500 mb-1">
                {r.topic} • {r.style}
              </div>
              <div>{r.text}</div>
            </div>
          ))}
        </div>
      )}

      {summaries.length > 0 && (
        <div className="space-y-3">
          <div className="font-semibold mt-4">Community Summaries</div>
          {summaries.map((c, i) => (
            <div key={i} className="p-4 rounded-2xl border bg-blue-50">
              <div className="text-xs text-gray-500 mb-1">{c.title}</div>
              <div>{c.summary}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

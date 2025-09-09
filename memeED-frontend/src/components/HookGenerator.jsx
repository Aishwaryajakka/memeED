import { useState } from "react";
import { createHook } from "../api";

export default function HookGenerator() {
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("meme");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function onGenerate(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await createHook({ topic, style });
      console.log("HOOK DATA", data);
      setResult(data);
    } catch (err) {
      setError(err?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  } // ← function ends here (do NOT put an extra "};" after this)

  return (
    <section className="space-y-4 border rounded p-4">
      <form onSubmit={onGenerate} className="grid gap-3 md:grid-cols-[1fr,160px,120px]">
        <input
          className="border rounded p-2"
          placeholder="Topic (e.g., photosynthesis)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <select
          className="border rounded p-2"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
        >
          <option value="meme">meme</option>
          <option value="analogy">analogy</option>
          <option value="story">story</option>
        </select>
        <button className="bg-black text-white rounded px-4" disabled={!topic || loading}>
          {loading ? "Generating…" : "Generate"}
        </button>
      </form>

      {error && <div className="text-red-600">{error}</div>}

      {result && (
        <div className="space-y-2">
          <div className="font-semibold">Hook</div>
          <div className="border rounded p-3">{result.hook || "No hook"}</div>

          <div className="text-sm text-gray-600">
            <span className="font-medium">Used:</span>{" "}
            {result.context?.graphrag_used ? "GraphRAG " : ""}
            {result.context?.weaviate_used ? "Weaviate" : (!result.context?.graphrag_used ? "none" : "")}
          </div>

          {result.context?.graph_snippets?.length > 0 && (
            <>
              <div className="font-medium">GraphRAG snippets</div>
              <ul className="list-disc pl-6 text-sm">
                {result.context.graph_snippets.map((s, i) => (
                  <li key={`g-${i}`}>{s}</li>
                ))}
              </ul>
            </>
          )}

          {result.context?.weaviate_snippets?.length > 0 && (
            <>
              <div className="font-medium">Weaviate snippets</div>
              <ul className="list-disc pl-6 text-sm">
                {result.context.weaviate_snippets.map((s, i) => (
                  <li key={`w-${i}`}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

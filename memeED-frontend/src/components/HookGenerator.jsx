import { useState } from "react";
import { createHook, createQuiz } from "../api";

export default function HookGenerator() {
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("meme");
  const [hook, setHook] = useState("");
  const [isGenHook, setIsGenHook] = useState(false);
  const [quiz, setQuiz] = useState([]);
  const [isGenQuiz, setIsGenQuiz] = useState(false);
  const [copied, setCopied] = useState(false);
  const disabled = !topic.trim();

  const onGenHook = async () => {
    try {
      setIsGenHook(true);
      const { hook } = await createHook({ topic, style });
      setHook(hook);
    } catch (e) {
      alert("Failed to generate hook. Is the backend running on :8080?");
      console.error(e);
    } finally {
      setIsGenHook(false);
    }
  };

  const onGenQuiz = async () => {
    try {
      setIsGenQuiz(true);
      const { items } = await createQuiz({ topic, level: "easy" });
      setQuiz(items || []);
    } catch (e) {
      alert("Failed to generate quiz.");
      console.error(e);
    } finally {
      setIsGenQuiz(false);
    }
  };

  const copyHook = async () => {
    if (!hook) return;
    try {
      await navigator.clipboard.writeText(hook);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr,160px]">
        <input
          className="border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder='Topic (e.g., "photosynthesis", "algebra fractions")'
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <select
          className="border rounded-xl px-3 py-2"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
        >
          <option value="meme">Meme</option>
          <option value="analogy">Analogy</option>
          <option value="story">Story</option>
        </select>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onGenHook}
          disabled={disabled || isGenHook}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white disabled:opacity-40"
        >
          {isGenHook ? "Generating…" : "Generate Hook"}
        </button>
        <button
          onClick={onGenQuiz}
          disabled={disabled || isGenQuiz}
          className="px-4 py-2 rounded-xl border"
        >
          {isGenQuiz ? "Making Quiz…" : "Generate Quiz"}
        </button>
      </div>

      {hook && (
        <div className="p-4 rounded-2xl border shadow-sm bg-white">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold">Hook</h3>
            <button
              onClick={copyHook}
              className="text-xs px-2 py-1 rounded-lg border"
              title="Copy"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="mt-2">{hook}</p>
          <div className="mt-2 text-xs text-gray-500">
            Topic: {topic} • Style: {style}
          </div>
        </div>
      )}

      {quiz.length > 0 && (
        <div className="p-4 rounded-2xl border shadow-sm bg-white">
          <h3 className="font-semibold">Quiz (3)</h3>
          <ol className="list-decimal pl-5 mt-2 space-y-3">
            {quiz.map((q, i) => (
              <li key={i}>
                <div className="font-medium">{q.question}</div>
                <ul className="list-disc pl-5 mt-1">
                  {q.choices?.map((c, j) => <li key={j}>{c}</li>)}
                </ul>
                <div className="text-xs text-gray-500 mt-1">Answer: {q.answer}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

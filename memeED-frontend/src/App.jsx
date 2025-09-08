import Header from "./components/Header";
import HookGenerator from "./components/HookGenerator";
import SearchBox from "./components/SearchBox";

export default function App() {
  return (
    <div className="min-h-screen">
      <main className="max-w-3xl mx-auto p-6">
        <Header />
        <div className="grid gap-8">
          <HookGenerator />
          <SearchBox />
        </div>
        <footer className="mt-10 text-xs text-gray-500">
          Built with ❤️ at Hack Day · meme<span className="text-indigo-600">ED</span>
        </footer>
      </main>
    </div>
  );
}

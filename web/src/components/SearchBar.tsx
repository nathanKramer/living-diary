import { useState } from "react";
import type { MemoryType } from "@shared/types";

const MEMORY_TYPES: Array<{ value: MemoryType | ""; label: string }> = [
  { value: "", label: "All types" },
  { value: "diary_entry", label: "Diary entries" },
  { value: "user_fact", label: "User facts" },
  { value: "photo_memory", label: "Photos" },
  { value: "conversation_summary", label: "Summaries" },
  { value: "reflection", label: "Reflections" },
];

interface Props {
  onSearch: (query: string, type?: MemoryType) => void;
  loading: boolean;
}

export function SearchBar({ onSearch, loading }: Props) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<MemoryType | "">("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onSearch(query.trim(), type || undefined);
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search memories..."
        disabled={loading}
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as MemoryType | "")}
        disabled={loading}
      >
        {MEMORY_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <button type="submit" disabled={loading || !query.trim()}>
        {loading ? "Searching..." : "Search"}
      </button>
    </form>
  );
}

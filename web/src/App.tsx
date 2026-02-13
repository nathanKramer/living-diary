import { useState, useEffect, useCallback } from "react";
import { Routes, Route } from "react-router-dom";
import type { Memory, MemoryType } from "@shared/types";
import { api } from "./api";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { MemoryList } from "./components/MemoryList";
import { SearchBar } from "./components/SearchBar";
import { StatsPanel } from "./components/StatsPanel";
import { PersonaPanel } from "./components/PersonaPanel";
import { PeoplePanel } from "./components/PeoplePanel";
import { PersonDetailPage } from "./components/PersonDetailPage";

const PAGE_SIZE = 50;

function AllMemories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const loadRecent = useCallback(async (lim: number) => {
    setLoading(true);
    try {
      const { memories } = await api.getRecent(lim);
      setMemories(memories);
    } catch (err) {
      console.error("Failed to load memories:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecent(limit);
  }, [limit, loadRecent]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  const handleUpdate = (updated: Memory) => {
    setMemories((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  };

  return (
    <MemoryList
      memories={memories}
      loading={loading}
      onLoadMore={() => setLimit((prev) => prev + PAGE_SIZE)}
      hasMore={memories.length >= limit}
      onDelete={handleDelete}
      onUpdate={handleUpdate}
    />
  );
}

function SearchPage() {
  const [searchResults, setSearchResults] = useState<Memory[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (query: string, type?: MemoryType) => {
    setSearchLoading(true);
    setHasSearched(true);
    try {
      const { memories } = await api.search(query, 20, type);
      setSearchResults(memories);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteMemory(id);
      setSearchResults((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  const handleUpdate = (updated: Memory) => {
    setSearchResults((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  };

  return (
    <>
      <SearchBar onSearch={handleSearch} loading={searchLoading} />
      {hasSearched && (
        <MemoryList memories={searchResults} loading={searchLoading} onDelete={handleDelete} onUpdate={handleUpdate} />
      )}
    </>
  );
}

export function App() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<AllMemories />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="people" element={<PeoplePanel />} />
          <Route path="people/:id" element={<PersonDetailPage />} />
          <Route path="stats" element={<StatsPanel />} />
          <Route path="settings" element={<PersonaPanel />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}

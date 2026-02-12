import { useState, useEffect, useCallback } from "react";
import type { Memory, MemoryType } from "@shared/types";
import { api } from "./api";
import { AuthGate } from "./components/AuthGate";
import { Layout, type Tab } from "./components/Layout";
import { MemoryList } from "./components/MemoryList";
import { SearchBar } from "./components/SearchBar";
import { StatsPanel } from "./components/StatsPanel";
import { PersonaPanel } from "./components/PersonaPanel";
import { PeoplePanel } from "./components/PeoplePanel";

const PAGE_SIZE = 50;

export function App() {
  const [tab, setTab] = useState<Tab>("all");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Search state
  const [searchResults, setSearchResults] = useState<Memory[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

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

  const handleLoadMore = () => {
    setLimit((prev) => prev + PAGE_SIZE);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setSearchResults((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  return (
    <AuthGate>
      <Layout activeTab={tab} onTabChange={setTab}>
        {tab === "all" && (
          <MemoryList
            memories={memories}
            loading={loading}
            onLoadMore={handleLoadMore}
            hasMore={memories.length >= limit}
            onDelete={handleDelete}
          />
        )}
        {tab === "search" && (
          <>
            <SearchBar onSearch={handleSearch} loading={searchLoading} />
            {hasSearched && (
              <MemoryList memories={searchResults} loading={searchLoading} onDelete={handleDelete} />
            )}
          </>
        )}
        {tab === "people" && <PeoplePanel />}
        {tab === "stats" && <StatsPanel />}
        {tab === "settings" && <PersonaPanel />}
      </Layout>
    </AuthGate>
  );
}

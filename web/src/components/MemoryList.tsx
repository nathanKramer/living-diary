import type { Memory } from "@shared/types";
import { MemoryCard } from "./MemoryCard";

interface Props {
  memories: Memory[];
  loading: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function MemoryList({ memories, loading, onLoadMore, hasMore }: Props) {
  if (loading && memories.length === 0) {
    return <p className="empty-state">Loading memories...</p>;
  }

  if (memories.length === 0) {
    return <p className="empty-state">No memories found.</p>;
  }

  return (
    <div className="memory-list">
      {memories.map((m) => (
        <MemoryCard key={m.id} memory={m} />
      ))}
      {hasMore && onLoadMore && (
        <button className="load-more" onClick={onLoadMore} disabled={loading}>
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}

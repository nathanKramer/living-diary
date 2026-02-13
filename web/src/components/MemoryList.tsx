import type { Memory } from "@shared/types";
import { MemoryCard } from "./MemoryCard";

interface Props {
  memories: Memory[];
  loading: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onDelete?: (id: string) => void;
  onUpdate?: (updated: Memory) => void;
}

export function MemoryList({ memories, loading, onLoadMore, hasMore, onDelete, onUpdate }: Props) {
  if (loading && memories.length === 0) {
    return <p className="empty-state">Loading memories...</p>;
  }

  if (memories.length === 0) {
    return <p className="empty-state">No memories found.</p>;
  }

  return (
    <div className="memory-list">
      {memories.map((m) => (
        <MemoryCard key={m.id} memory={m} onDelete={onDelete} onUpdate={onUpdate} />
      ))}
      {hasMore && onLoadMore && (
        <button className="load-more" onClick={onLoadMore} disabled={loading}>
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}

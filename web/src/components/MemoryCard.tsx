import type { Memory } from "@shared/types";

const TYPE_COLORS: Record<string, string> = {
  diary_entry: "#4a9eff",
  user_fact: "#10b981",
  photo_memory: "#f59e0b",
  conversation_summary: "#8b5cf6",
  reflection: "#ec4899",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatType(type: string): string {
  return type.replace(/_/g, " ");
}

interface Props {
  memory: Memory;
}

export function MemoryCard({ memory }: Props) {
  const tags = memory.tags ? memory.tags.split(",").filter(Boolean) : [];

  return (
    <div className="memory-card">
      <div className="memory-header">
        <span
          className="memory-type"
          style={{ backgroundColor: TYPE_COLORS[memory.type] ?? "#6b7280" }}
        >
          {formatType(memory.type)}
        </span>
        <span className="memory-date">{formatDate(memory.timestamp)}</span>
      </div>
      <p className="memory-content">{memory.content}</p>
      {tags.length > 0 && (
        <div className="memory-tags">
          {tags.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      )}
      {memory.photoFileId && (
        <span className="photo-indicator">has photo</span>
      )}
    </div>
  );
}

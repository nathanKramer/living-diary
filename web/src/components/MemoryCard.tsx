import { useState, useEffect } from "react";
import type { Memory, MemoryType } from "@shared/types";
import { api, getToken } from "../api";

const TYPE_COLORS: Record<string, string> = {
  diary_entry: "#F5A623",
  user_fact: "#7CB86A",
  photo_memory: "#FF9B71",
  video_memory: "#E87461",
  conversation_summary: "#A78BDB",
  reflection: "#E88FB4",
};

const MEMORY_TYPES: MemoryType[] = [
  "diary_entry",
  "user_fact",
  "photo_memory",
  "video_memory",
  "conversation_summary",
  "reflection",
];

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
  onDelete?: (id: string) => void;
  onUpdate?: (updated: Memory) => void;
}

export function MemoryCard({ memory, onDelete, onUpdate }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editContent, setEditContent] = useState(memory.content);
  const [editType, setEditType] = useState(memory.type);
  const [editTags, setEditTags] = useState(memory.tags);
  const [editSubject, setEditSubject] = useState(memory.subjectName ?? "");

  const tags = memory.tags ? memory.tags.split(",").filter(Boolean) : [];

  function startEdit() {
    setEditContent(memory.content);
    setEditType(memory.type);
    setEditTags(memory.tags);
    setEditSubject(memory.subjectName ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const updates: Record<string, string | null> = {};
      if (editContent !== memory.content) updates.content = editContent;
      if (editType !== memory.type) updates.type = editType;
      if (editTags !== memory.tags) updates.tags = editTags;
      const newSubject = editSubject.trim() || null;
      if (newSubject !== (memory.subjectName ?? null)) updates.subjectName = newSubject;

      if (Object.keys(updates).length === 0) {
        setEditing(false);
        return;
      }

      const { memory: updated } = await api.updateMemory(memory.id, updates);
      onUpdate?.(updated);
      setEditing(false);
    } catch (err) {
      console.error("Failed to update memory:", err);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="memory-card">
        <div className="memory-header">
          <span
            className="memory-type"
            style={{ backgroundColor: TYPE_COLORS[editType] ?? "#6b7280" }}
          >
            {formatType(editType)}
          </span>
          <span className="memory-date">{formatDate(memory.timestamp)}</span>
        </div>
        <div className="memory-edit-form">
          <div className="edit-field">
            <label>Content</label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
            />
          </div>
          <div className="edit-field">
            <label>Type</label>
            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value as MemoryType)}
            >
              {MEMORY_TYPES.map((t) => (
                <option key={t} value={t}>{formatType(t)}</option>
              ))}
            </select>
          </div>
          <div className="edit-field">
            <label>Tags (comma-separated)</label>
            <input
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
            />
          </div>
          <div className="edit-field">
            <label>Subject (comma-separated names)</label>
            <input
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              placeholder="e.g. Nathan, Oscar"
            />
          </div>
          <div className="edit-actions">
            <button className="save-btn" onClick={saveEdit} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="cancel-btn" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="memory-card">
      <div className="memory-header">
        <span
          className="memory-type"
          style={{ backgroundColor: TYPE_COLORS[memory.type] ?? "#6b7280" }}
        >
          {formatType(memory.type)}
        </span>
        <div className="memory-header-right">
          <span className="memory-date">{formatDate(memory.timestamp)}</span>
          {onUpdate && !confirming && (
            <button
              className="edit-memory-btn"
              onClick={startEdit}
              title="Edit memory"
            >
              &#9998;
            </button>
          )}
          {onDelete && !confirming && (
            <button
              className="delete-btn"
              onClick={() => setConfirming(true)}
              title="Delete memory"
            >
              &times;
            </button>
          )}
          {onDelete && confirming && (
            <span className="confirm-delete">
              <button className="delete-confirm" onClick={() => onDelete(memory.id)}>
                Delete
              </button>
              <button className="delete-cancel" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </span>
          )}
        </div>
      </div>
      {memory.subjectName && (
        <span className="memory-subject">{memory.subjectName}</span>
      )}
      <p className="memory-content">{memory.content}</p>
      {tags.length > 0 && (
        <div className="memory-tags">
          {tags.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      )}
      {memory.photoFileId && memory.type === "photo_memory" && (
        <PhotoPreview fileId={memory.photoFileId} />
      )}
      {memory.photoFileId && memory.type === "video_memory" && (
        <span className="photo-indicator">has video</span>
      )}
      {memory.source && (
        <button className="source-toggle" onClick={() => setShowSource(!showSource)}>
          {showSource ? "Hide original" : "Show original"}
        </button>
      )}
      {showSource && memory.source && (
        <p className="memory-source">{memory.source}</p>
      )}
    </div>
  );
}

function PhotoPreview({ fileId }: { fileId: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch(`/api/media/${fileId}`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        revoke = URL.createObjectURL(blob);
        setSrc(revoke);
      })
      .catch(() => setSrc(null));

    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [fileId]);

  if (!src) return null;
  return <img className="memory-photo" src={src} alt="Photo memory" />;
}

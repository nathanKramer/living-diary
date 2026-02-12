import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import type {
  Memory,
  Person,
  Relationship,
  RelationshipType,
} from "@shared/types";
import { MemoryCard } from "./MemoryCard";

const RELATIONSHIP_TYPES: RelationshipType[] = [
  "sibling",
  "parent",
  "child",
  "partner",
  "friend",
  "coworker",
  "pet",
  "other",
];

const REL_COLORS: Record<string, string> = {
  sibling: "#3b82f6",
  parent: "#8b5cf6",
  child: "#8b5cf6",
  partner: "#ec4899",
  friend: "#10b981",
  coworker: "#f59e0b",
  pet: "#f97316",
  other: "#6b7280",
};

export function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [person, setPerson] = useState<Person | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showAddRel, setShowAddRel] = useState(false);
  const [relTargetId, setRelTargetId] = useState("");
  const [relType, setRelType] = useState<RelationshipType>("friend");
  const [relLabel, setRelLabel] = useState("");

  const [showMerge, setShowMerge] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");

  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(true);

  const load = async () => {
    try {
      const graph = await api.getPeople();
      setPeople(graph.people);
      setRelationships(graph.relationships);
      const found = graph.people.find((p) => p.id === id);
      if (found) {
        setPerson(found);
        setName(found.name);
        setAliases(found.aliases.join(", "));
        setBio(found.bio);
      } else {
        setPerson(null);
      }
    } catch (err) {
      console.error("Failed to load people:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!person) return;
    setMemoriesLoading(true);
    const names = [person.name, ...person.aliases];
    api
      .getBySubject(names)
      .then(({ memories }) => setMemories(memories))
      .catch((err) => console.error("Failed to load person memories:", err))
      .finally(() => setMemoriesLoading(false));
  }, [person?.name, person?.aliases]);

  const handleDeleteMemory = async (memId: string) => {
    try {
      await api.deleteMemory(memId);
      setMemories((prev) => prev.filter((m) => m.id !== memId));
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  if (loading) {
    return <p className="empty-state">Loading...</p>;
  }

  if (!person) {
    return <p className="empty-state">Person not found.</p>;
  }

  const personRels = relationships.filter(
    (r) => r.personId1 === person.id || r.personId2 === person.id,
  );

  const otherPeople = people.filter((p) => p.id !== person.id);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.updatePerson(person.id, {
        name: name.trim(),
        aliases: aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        bio: bio.trim(),
      });
      setEditing(false);
      load();
    } catch (err) {
      console.error("Failed to update person:", err);
      setError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Delete ${person.name}? This will also remove their relationships.`,
      )
    )
      return;
    try {
      await api.deletePerson(person.id);
      navigate("/people");
    } catch (err) {
      console.error("Failed to delete person:", err);
      setError("Failed to delete person.");
    }
  };

  const handleAddRelationship = async () => {
    if (!relTargetId || !relLabel.trim()) return;
    setError("");
    try {
      await api.addRelationship(
        person.id,
        relTargetId,
        relType,
        relLabel.trim(),
      );
      setShowAddRel(false);
      setRelLabel("");
      load();
    } catch (err) {
      console.error("Failed to add relationship:", err);
      setError("Failed to add relationship.");
    }
  };

  const handleDeleteRelationship = async (relId: string) => {
    try {
      await api.deleteRelationship(relId);
      load();
    } catch (err) {
      console.error("Failed to delete relationship:", err);
    }
  };

  const handleMerge = async () => {
    if (!mergeTargetId) return;
    const target = people.find((p) => p.id === mergeTargetId);
    if (
      !confirm(
        `Merge "${target?.name}" into "${person.name}"? This cannot be undone.`,
      )
    )
      return;
    try {
      await api.mergePeople(person.id, mergeTargetId);
      setShowMerge(false);
      load();
    } catch (err) {
      console.error("Failed to merge:", err);
      setError("Failed to merge people.");
    }
  };

  return (
    <div className="person-detail">
      <button className="back-btn" onClick={() => navigate("/people")}>
        &larr; Back
      </button>

      {editing ? (
        <div className="person-edit">
          <div className="edit-field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="edit-field">
            <label>Aliases (comma-separated)</label>
            <input
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="Mum, Mother"
            />
          </div>
          <div className="edit-field">
            <label>Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
            />
          </div>
          <div className="edit-actions">
            <button
              className="save-btn"
              onClick={handleSave}
              disabled={saving || !name.trim()}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="cancel-btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="person-info">
          <h2>{person.name}</h2>
          {person.aliases.length > 0 && (
            <p className="person-aliases">
              Also known as: {person.aliases.join(", ")}
            </p>
          )}
          {person.bio && <p className="person-bio">{person.bio}</p>}
          <div className="person-meta">
            Added{" "}
            {new Date(person.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>
          <div className="person-actions">
            <button className="edit-btn" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className="delete-person-btn" onClick={handleDelete}>
              Delete
            </button>
            {otherPeople.length > 0 && (
              <button
                className="merge-btn"
                onClick={() => setShowMerge(!showMerge)}
              >
                Merge
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {showMerge && (
        <div className="merge-section">
          <p className="merge-hint">
            Select a person to merge into {person.name}:
          </p>
          <div className="merge-controls">
            <select
              value={mergeTargetId}
              onChange={(e) => setMergeTargetId(e.target.value)}
            >
              <option value="">Select person...</option>
              {otherPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button onClick={handleMerge} disabled={!mergeTargetId}>
              Merge
            </button>
          </div>
        </div>
      )}

      <div className="relationships-section">
        <h3>Relationships</h3>
        {personRels.length === 0 && (
          <p className="empty-hint">No relationships yet.</p>
        )}
        {personRels.map((rel) => {
          const otherId =
            rel.personId1 === person.id ? rel.personId2 : rel.personId1;
          const other = people.find((p) => p.id === otherId);
          return (
            <div key={rel.id} className="relationship-row">
              <span
                className="rel-badge"
                style={{ backgroundColor: REL_COLORS[rel.type] ?? "#6b7280" }}
              >
                {rel.type}
              </span>
              <span className="rel-label">{rel.label}</span>
              <span className="rel-other">{other?.name ?? "Unknown"}</span>
              <button
                className="rel-delete"
                onClick={() => handleDeleteRelationship(rel.id)}
              >
                &times;
              </button>
            </div>
          );
        })}

        {!showAddRel && otherPeople.length > 0 && (
          <button className="add-rel-btn" onClick={() => setShowAddRel(true)}>
            + Add relationship
          </button>
        )}

        {showAddRel && (
          <div className="add-rel-form">
            <select
              value={relTargetId}
              onChange={(e) => setRelTargetId(e.target.value)}
            >
              <option value="">Select person...</option>
              {otherPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={relType}
              onChange={(e) => setRelType(e.target.value as RelationshipType)}
            >
              {RELATIONSHIP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              placeholder="Label (e.g. sisters)"
              value={relLabel}
              onChange={(e) => setRelLabel(e.target.value)}
            />
            <div className="add-rel-actions">
              <button
                onClick={handleAddRelationship}
                disabled={!relTargetId || !relLabel.trim()}
              >
                Add
              </button>
              <button
                className="cancel-btn"
                onClick={() => setShowAddRel(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="person-memories-section">
        <h3>Related memories</h3>
        {memoriesLoading && <p className="empty-hint">Loading memories...</p>}
        {!memoriesLoading && memories.length === 0 && (
          <p className="empty-hint">No memories found for {person.name}.</p>
        )}
        {!memoriesLoading && memories.length > 0 && (
          <div className="memory-list">
            {memories.map((m) => (
              <MemoryCard key={m.id} memory={m} onDelete={handleDeleteMemory} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

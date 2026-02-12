import { useState, useEffect } from "react";
import { api } from "../api";
import type { Person, Relationship, RelationshipType } from "@shared/types";
import { PeopleGraph } from "./PeopleGraph";

const RELATIONSHIP_TYPES: RelationshipType[] = [
  "sibling", "parent", "child", "partner", "friend", "coworker", "pet", "other",
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

interface PersonDetailProps {
  person: Person;
  people: Person[];
  relationships: Relationship[];
  onUpdate: () => void;
  onBack: () => void;
}

function PersonDetail({ person, people, relationships, onUpdate, onBack }: PersonDetailProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name);
  const [aliases, setAliases] = useState(person.aliases.join(", "));
  const [bio, setBio] = useState(person.bio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Add relationship state
  const [showAddRel, setShowAddRel] = useState(false);
  const [relTargetId, setRelTargetId] = useState("");
  const [relType, setRelType] = useState<RelationshipType>("friend");
  const [relLabel, setRelLabel] = useState("");

  // Merge state
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");

  const personRels = relationships.filter(
    (r) => r.personId1 === person.id || r.personId2 === person.id,
  );

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.updatePerson(person.id, {
        name: name.trim(),
        aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
        bio: bio.trim(),
      });
      setEditing(false);
      onUpdate();
    } catch (err) {
      console.error("Failed to update person:", err);
      setError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${person.name}? This will also remove their relationships.`)) return;
    try {
      await api.deletePerson(person.id);
      onUpdate();
      onBack();
    } catch (err) {
      console.error("Failed to delete person:", err);
      setError("Failed to delete person.");
    }
  };

  const handleAddRelationship = async () => {
    if (!relTargetId || !relLabel.trim()) return;
    setError("");
    try {
      await api.addRelationship(person.id, relTargetId, relType, relLabel.trim());
      setShowAddRel(false);
      setRelLabel("");
      onUpdate();
    } catch (err) {
      console.error("Failed to add relationship:", err);
      setError("Failed to add relationship.");
    }
  };

  const handleDeleteRelationship = async (relId: string) => {
    try {
      await api.deleteRelationship(relId);
      onUpdate();
    } catch (err) {
      console.error("Failed to delete relationship:", err);
    }
  };

  const handleMerge = async () => {
    if (!mergeTargetId) return;
    const target = people.find((p) => p.id === mergeTargetId);
    if (!confirm(`Merge "${target?.name}" into "${person.name}"? This cannot be undone.`)) return;
    try {
      await api.mergePeople(person.id, mergeTargetId);
      setShowMerge(false);
      onUpdate();
    } catch (err) {
      console.error("Failed to merge:", err);
      setError("Failed to merge people.");
    }
  };

  const otherPeople = people.filter((p) => p.id !== person.id);

  return (
    <div className="person-detail">
      <button className="back-btn" onClick={onBack}>&larr; Back</button>

      {editing ? (
        <div className="person-edit">
          <div className="edit-field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="edit-field">
            <label>Aliases (comma-separated)</label>
            <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Mom, Mother" />
          </div>
          <div className="edit-field">
            <label>Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
          </div>
          <div className="edit-actions">
            <button className="save-btn" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="cancel-btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="person-info">
          <h2>{person.name}</h2>
          {person.aliases.length > 0 && (
            <p className="person-aliases">Also known as: {person.aliases.join(", ")}</p>
          )}
          {person.bio && <p className="person-bio">{person.bio}</p>}
          <div className="person-meta">
            Added {new Date(person.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
          </div>
          <div className="person-actions">
            <button className="edit-btn" onClick={() => setEditing(true)}>Edit</button>
            <button className="delete-person-btn" onClick={handleDelete}>Delete</button>
            {otherPeople.length > 0 && (
              <button className="merge-btn" onClick={() => setShowMerge(!showMerge)}>Merge</button>
            )}
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {showMerge && (
        <div className="merge-section">
          <p className="merge-hint">Select a person to merge into {person.name}:</p>
          <div className="merge-controls">
            <select value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)}>
              <option value="">Select person...</option>
              {otherPeople.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button onClick={handleMerge} disabled={!mergeTargetId}>Merge</button>
          </div>
        </div>
      )}

      <div className="relationships-section">
        <h3>Relationships</h3>
        {personRels.length === 0 && <p className="empty-hint">No relationships yet.</p>}
        {personRels.map((rel) => {
          const otherId = rel.personId1 === person.id ? rel.personId2 : rel.personId1;
          const other = people.find((p) => p.id === otherId);
          return (
            <div key={rel.id} className="relationship-row">
              <span className="rel-badge" style={{ backgroundColor: REL_COLORS[rel.type] ?? "#6b7280" }}>
                {rel.type}
              </span>
              <span className="rel-label">{rel.label}</span>
              <span className="rel-other">{other?.name ?? "Unknown"}</span>
              <button className="rel-delete" onClick={() => handleDeleteRelationship(rel.id)}>&times;</button>
            </div>
          );
        })}

        {!showAddRel && otherPeople.length > 0 && (
          <button className="add-rel-btn" onClick={() => setShowAddRel(true)}>+ Add relationship</button>
        )}

        {showAddRel && (
          <div className="add-rel-form">
            <select value={relTargetId} onChange={(e) => setRelTargetId(e.target.value)}>
              <option value="">Select person...</option>
              {otherPeople.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select value={relType} onChange={(e) => setRelType(e.target.value as RelationshipType)}>
              {RELATIONSHIP_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              placeholder="Label (e.g. sisters)"
              value={relLabel}
              onChange={(e) => setRelLabel(e.target.value)}
            />
            <div className="add-rel-actions">
              <button onClick={handleAddRelationship} disabled={!relTargetId || !relLabel.trim()}>Add</button>
              <button className="cancel-btn" onClick={() => setShowAddRel(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PeoplePanel() {
  const [people, setPeople] = useState<Person[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");

  const load = async () => {
    try {
      const graph = await api.getPeople();
      setPeople(graph.people);
      setRelationships(graph.relationships);
    } catch (err) {
      console.error("Failed to load people:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleUpdate = () => {
    load();
  };

  if (loading) {
    return <p className="empty-state">Loading people...</p>;
  }

  const selected = selectedId ? people.find((p) => p.id === selectedId) : null;

  if (selected) {
    return (
      <PersonDetail
        person={selected}
        people={people}
        relationships={relationships}
        onUpdate={handleUpdate}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  if (people.length === 0) {
    return (
      <p className="empty-state">
        No people recorded yet. As you chat with the bot and mention people, they'll appear here.
      </p>
    );
  }

  return (
    <div className="people-panel-content">
      <div className="people-view-toggle">
        <button
          className={viewMode === "list" ? "active" : ""}
          onClick={() => setViewMode("list")}
        >
          List
        </button>
        <button
          className={viewMode === "graph" ? "active" : ""}
          onClick={() => setViewMode("graph")}
        >
          Graph
        </button>
      </div>

      {viewMode === "graph" ? (
        <PeopleGraph
          people={people}
          relationships={relationships}
          onSelectPerson={setSelectedId}
        />
      ) : (
        <div className="people-list">
          {people.map((person) => {
            const personRels = relationships.filter(
              (r) => r.personId1 === person.id || r.personId2 === person.id,
            );
            return (
              <div key={person.id} className="person-card" onClick={() => setSelectedId(person.id)}>
                <div className="person-card-header">
                  <span className="person-name">{person.name}</span>
                  {person.aliases.length > 0 && (
                    <span className="person-card-aliases">{person.aliases.join(", ")}</span>
                  )}
                </div>
                {person.bio && <p className="person-card-bio">{person.bio}</p>}
                {personRels.length > 0 && (
                  <div className="person-card-rels">
                    {personRels.map((rel) => (
                      <span
                        key={rel.id}
                        className="rel-badge-small"
                        style={{ backgroundColor: REL_COLORS[rel.type] ?? "#6b7280" }}
                      >
                        {rel.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { api } from "../api";
import type { Persona, CoreMemories } from "../api";

function CoreMemoriesSection() {
  const [coreMemories, setCoreMemories] = useState<CoreMemories | null>(null);
  const [loading, setLoading] = useState(true);
  const [nameInput, setNameInput] = useState("");
  const [newEntry, setNewEntry] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getCoreMemories()
      .then(({ coreMemories }) => {
        setCoreMemories(coreMemories);
        setNameInput(coreMemories.name ?? "");
      })
      .catch((err) => console.error("Failed to load core memories:", err))
      .finally(() => setLoading(false));
  }, []);

  const nameChanged = coreMemories !== null && nameInput !== (coreMemories.name ?? "");

  const handleSaveName = async () => {
    setSaving(true);
    setError("");
    try {
      const { coreMemories: updated } = await api.setCoreMemoryName(nameInput.trim() || null);
      setCoreMemories(updated);
    } catch (err) {
      console.error("Failed to save name:", err);
      setError("Failed to save name.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddEntry = async () => {
    if (!newEntry.trim()) return;
    setError("");
    try {
      const { coreMemories: updated } = await api.addCoreMemoryEntry(newEntry.trim());
      setCoreMemories(updated);
      setNewEntry("");
    } catch (err) {
      console.error("Failed to add entry:", err);
      setError("Failed to add entry.");
    }
  };

  const handleDeleteEntry = async (id: string) => {
    setError("");
    try {
      const { coreMemories: updated } = await api.deleteCoreMemoryEntry(id);
      setCoreMemories(updated);
    } catch (err) {
      console.error("Failed to delete entry:", err);
      setError("Failed to delete entry.");
    }
  };

  if (loading) return null;

  return (
    <div className="persona-section">
      <h2>Core Memories</h2>
      <p className="persona-hint">
        Things the diary knows about itself — its name and identity.
      </p>

      <div className="edit-field">
        <label>Name</label>
        <div className="core-memory-name-row">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Give your diary a name..."
          />
          {nameChanged && (
            <button
              className="save-btn"
              onClick={handleSaveName}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </div>

      <div className="edit-field">
        <label>Self-knowledge</label>
        {coreMemories && coreMemories.entries.length > 0 && (
          <div className="core-memory-entries">
            {coreMemories.entries.map((entry) => (
              <div key={entry.id} className="core-memory-entry">
                <span>{entry.content}</span>
                <button
                  className="rel-delete"
                  onClick={() => handleDeleteEntry(entry.id)}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="core-memory-name-row">
          <input
            value={newEntry}
            onChange={(e) => setNewEntry(e.target.value)}
            placeholder="e.g. I belong to the Kramer family"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddEntry();
            }}
          />
          <button
            className="save-btn"
            onClick={handleAddEntry}
            disabled={!newEntry.trim()}
          >
            Add
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

function PersonaSection() {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState("");
  const [editedPrompt, setEditedPrompt] = useState("");
  const [error, setError] = useState("");

  const hasEdits = persona !== null && editedPrompt !== persona.systemPromptAddition;

  useEffect(() => {
    api.getPersona()
      .then(({ persona }) => {
        setPersona(persona);
        setEditedPrompt(persona?.systemPromptAddition ?? "");
      })
      .catch((err) => console.error("Failed to load persona:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setGenerating(true);
    setError("");
    try {
      const { persona } = await api.updatePersona(description.trim());
      setPersona(persona);
      setEditedPrompt(persona.systemPromptAddition);
      setDescription("");
    } catch (err) {
      console.error("Failed to generate persona:", err);
      setError("Failed to generate persona. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!editedPrompt.trim()) return;
    setSaving(true);
    setError("");
    try {
      const { persona: updated } = await api.savePersona(
        editedPrompt.trim(),
        persona?.description,
      );
      setPersona(updated);
      setEditedPrompt(updated.systemPromptAddition);
    } catch (err) {
      console.error("Failed to save persona:", err);
      setError("Failed to save persona.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setError("");
    try {
      await api.resetPersona();
      setPersona(null);
      setEditedPrompt("");
    } catch (err) {
      console.error("Failed to reset persona:", err);
      setError("Failed to reset persona.");
    }
  };

  if (loading) {
    return <p className="empty-state">Loading settings...</p>;
  }

  return (
    <>
      <div className="persona-section">
        <h2>Persona</h2>
        <p className="persona-hint">
          Describe how you want the bot to behave and it will generate a custom persona.
        </p>

        <div className="persona-input-group">
          <textarea
            className="persona-input"
            placeholder='e.g. "A family diary shared between me, my wife, and our kids"'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            disabled={generating}
          />
          <button
            className="persona-generate-btn"
            onClick={handleGenerate}
            disabled={generating || !description.trim()}
          >
            {generating ? "Generating..." : "Generate persona"}
          </button>
        </div>

        {error && <p className="error">{error}</p>}
      </div>

      <div className="persona-section">
        <h3>Current persona</h3>
        {persona ? (
          <div className="persona-current">
            <div className="persona-description">
              <span className="persona-label">Description</span>
              <p>{persona.description}</p>
            </div>
            <div className="persona-prompt">
              <span className="persona-label">Prompt</span>
              <textarea
                className="persona-prompt-edit"
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                rows={12}
                disabled={saving}
              />
            </div>
            <div className="persona-actions">
              {hasEdits && (
                <button
                  className="persona-save-btn"
                  onClick={handleSave}
                  disabled={saving || !editedPrompt.trim()}
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              )}
              {hasEdits && (
                <button
                  className="persona-discard-btn"
                  onClick={() => setEditedPrompt(persona.systemPromptAddition)}
                >
                  Discard
                </button>
              )}
              <button className="persona-reset-btn" onClick={handleReset}>
                Reset to default
              </button>
            </div>
            <div className="persona-meta">
              Updated {new Date(persona.updatedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        ) : (
          <p className="persona-default">Using default persona (personal diary companion)</p>
        )}
      </div>
    </>
  );
}

export function SettingsPanel() {
  return (
    <div className="persona-panel">
      <CoreMemoriesSection />
      <PersonaSection />
    </div>
  );
}

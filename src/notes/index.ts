import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";

export interface Note {
  id: string;
  content: string;
  createdAt: number;
}

export interface NotesData {
  notes: Note[];
  updatedAt: number;
}

const MAX_NOTES = 50;

function notesPath(): string {
  return join(config.dataDir, "notes.json");
}

function emptyNotes(): NotesData {
  return { notes: [], updatedAt: Date.now() };
}

export async function loadNotes(): Promise<NotesData> {
  try {
    const raw = await readFile(notesPath(), "utf-8");
    const parsed = JSON.parse(raw) as NotesData;
    if (!Array.isArray(parsed.notes)) {
      return emptyNotes();
    }
    return parsed;
  } catch {
    return emptyNotes();
  }
}

export async function saveNotes(data: NotesData): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(notesPath(), JSON.stringify(data, null, 2), "utf-8");
}

export class NotesHolder {
  current: NotesData;

  constructor(initial: NotesData) {
    this.current = initial;
  }

  addNote(content: string): Note | null {
    if (this.current.notes.length >= MAX_NOTES) return null;

    const note: Note = {
      id: uuidv4(),
      content,
      createdAt: Date.now(),
    };
    this.current.notes.push(note);
    this.current.updatedAt = Date.now();
    return note;
  }

  removeNote(id: string): boolean {
    const idx = this.current.notes.findIndex((n) => n.id === id);
    if (idx === -1) return false;
    this.current.notes.splice(idx, 1);
    this.current.updatedAt = Date.now();
    return true;
  }

  formatForPrompt(): string | undefined {
    if (this.current.notes.length === 0) return undefined;

    const lines = this.current.notes.map((n) => {
      const date = new Date(n.createdAt).toISOString().split("T")[0];
      return `- [${date}] ${n.content} (id: ${n.id})`;
    });

    return `## Your notes to self\nThese are reminders you've written for yourself. Act on them when relevant, then use the complete_note tool to remove them.\n${lines.join("\n")}`;
  }

  async save(): Promise<void> {
    await saveNotes(this.current);
  }
}

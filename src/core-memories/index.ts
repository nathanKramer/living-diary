import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";

export interface CoreMemoryEntry {
  id: string;
  content: string;
  createdAt: number;
}

export interface CoreMemories {
  name: string | null;
  entries: CoreMemoryEntry[];
  updatedAt: number;
}

const MAX_ENTRIES = 20;

function coreMemoriesPath(): string {
  return join(config.dataDir, "core-memories.json");
}

function emptyCoreMemories(): CoreMemories {
  return { name: null, entries: [], updatedAt: Date.now() };
}

export async function loadCoreMemories(): Promise<CoreMemories> {
  try {
    const raw = await readFile(coreMemoriesPath(), "utf-8");
    const parsed = JSON.parse(raw) as CoreMemories;
    if (!Array.isArray(parsed.entries)) {
      return emptyCoreMemories();
    }
    return parsed;
  } catch {
    return emptyCoreMemories();
  }
}

export async function saveCoreMemories(data: CoreMemories): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(coreMemoriesPath(), JSON.stringify(data, null, 2), "utf-8");
}

export class CoreMemoryHolder {
  current: CoreMemories;

  constructor(initial: CoreMemories) {
    this.current = initial;
  }

  setName(name: string | null): void {
    this.current.name = name;
    this.current.updatedAt = Date.now();
  }

  addEntry(content: string): CoreMemoryEntry | null {
    if (this.current.entries.length >= MAX_ENTRIES) return null;

    const entry: CoreMemoryEntry = {
      id: uuidv4(),
      content,
      createdAt: Date.now(),
    };
    this.current.entries.push(entry);
    this.current.updatedAt = Date.now();
    return entry;
  }

  removeEntry(id: string): boolean {
    const idx = this.current.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.current.entries.splice(idx, 1);
    this.current.updatedAt = Date.now();
    return true;
  }

  formatForPrompt(): string | undefined {
    const parts: string[] = [];

    if (this.current.name) {
      parts.push(`Your name is ${this.current.name}.`);
    }

    for (const entry of this.current.entries) {
      parts.push(`- ${entry.content}`);
    }

    if (parts.length === 0) return undefined;

    return `## About you\n${parts.join("\n")}`;
  }

  async save(): Promise<void> {
    await saveCoreMemories(this.current);
  }
}

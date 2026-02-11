import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";

export interface Persona {
  description: string;
  systemPromptAddition: string;
  updatedAt: number;
}

function personaPath(): string {
  return join(config.dataDir, "persona.json");
}

export async function loadPersona(): Promise<Persona | null> {
  try {
    const raw = await readFile(personaPath(), "utf-8");
    return JSON.parse(raw) as Persona;
  } catch {
    return null;
  }
}

export async function savePersona(persona: Persona): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(personaPath(), JSON.stringify(persona, null, 2), "utf-8");
}

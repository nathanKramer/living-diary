import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { config } from "../config.js";
import type { MemoryStore, MemoryType } from "../memory/index.js";

const EXTRACTION_PROMPT = `You are a memory extraction system for a personal diary app. Analyze the conversation and extract important information worth remembering long-term.

Return a JSON object with this exact shape:
{
  "memories": [
    {
      "content": "string — the memory to store, written in third person about the user",
      "type": "diary_entry | user_fact",
      "tags": ["string"]
    }
  ]
}

## Memory types

- **user_fact**: A discrete, reusable fact about the user. Things like their name, job, relationships, preferences, habits, routines, goals. Write these as standalone statements.
  Examples: "Works as a software engineer at Acme Corp", "Has a dog named Max", "Prefers tea over coffee"

- **diary_entry**: A significant event, experience, emotion, or reflection from the conversation. These are episodic — tied to a moment in time.
  Examples: "Had a stressful day at work — a production outage lasted 3 hours", "Feeling excited about starting a new side project"

## Rules

- Only extract information that is worth remembering long-term
- Do NOT extract small talk, greetings, or trivial exchanges
- Do NOT extract things the AI said — only facts about or experiences of the user
- Avoid duplicating facts that are already in the provided existing memories
- If there is nothing worth extracting, return {"memories": []}
- Keep each memory concise — one clear idea per entry
- Tags should be short topic labels: "work", "health", "relationships", "hobbies", "goals", "family", etc.

Return ONLY the JSON object, no markdown fences, no explanation.`;

interface ExtractionResult {
  memories: Array<{
    content: string;
    type: MemoryType;
    tags: string[];
  }>;
}

function parseExtraction(text: string): ExtractionResult {
  // Strip markdown fences if the model adds them despite instructions
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as ExtractionResult;

    if (!parsed.memories || !Array.isArray(parsed.memories)) {
      return { memories: [] };
    }

    // Validate each memory
    return {
      memories: parsed.memories.filter(
        (m) =>
          typeof m.content === "string" &&
          m.content.length > 0 &&
          (m.type === "diary_entry" || m.type === "user_fact") &&
          Array.isArray(m.tags),
      ),
    };
  } catch {
    console.error("Failed to parse extraction result:", cleaned);
    return { memories: [] };
  }
}

export async function extractAndStoreMemories(
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>,
  existingMemories: string[],
  memory: MemoryStore,
  userId: number,
): Promise<void> {
  // Only extract if there's enough conversation to work with
  if (recentMessages.length < 2) return;

  // Build the extraction prompt with context
  const conversationText = recentMessages
    .slice(-6) // Last 3 exchanges
    .map((m) => `${m.role === "user" ? "User" : "Diary"}: ${m.content}`)
    .join("\n\n");

  const existingContext =
    existingMemories.length > 0
      ? `\n\n## Existing memories (do not duplicate these)\n${existingMemories.join("\n")}`
      : "";

  const { text } = await generateText({
    model: anthropic(config.aiModel),
    system: EXTRACTION_PROMPT,
    prompt: `${conversationText}${existingContext}`,
  });

  const result = parseExtraction(text);

  if (result.memories.length === 0) return;

  // Store each extracted memory
  for (const mem of result.memories) {
    const id = await memory.addMemory(mem.content, mem.type, userId, mem.tags);
    console.log(`Stored ${mem.type}: "${mem.content}" (${id})`);
  }
}

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

- Only extract NEW information the user is sharing for the first time
- Do NOT extract small talk, greetings, or trivial exchanges
- Do NOT extract things the AI said — only facts about or experiences of the user
- Do NOT extract information the AI recalled from memory — if the Diary is repeating back stored memories, that is not new information
- If the user is asking a question or querying past memories (e.g. "what happened on Monday?"), there is likely nothing new to extract
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
          (m.type === "diary_entry" || m.type === "user_fact" || m.type === "photo_memory") &&
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
  memory: MemoryStore,
  userId: number,
): Promise<void> {
  // Only extract if there's enough conversation to work with
  if (recentMessages.length < 2) return;

  // Only extract from what the user said — not from AI responses
  // (which may contain recalled memories we don't want to re-store)
  const userMessages = recentMessages
    .filter((m) => m.role === "user")
    .slice(-3);

  if (userMessages.length === 0) return;

  const conversationText = userMessages
    .map((m) => m.content)
    .join("\n\n");

  const { text } = await generateText({
    model: anthropic(config.aiModel),
    system: EXTRACTION_PROMPT,
    prompt: conversationText,
  });

  const result = parseExtraction(text);

  if (result.memories.length === 0) return;

  // Store each extracted memory (addMemory handles dedup via vector similarity)
  for (const mem of result.memories) {
    const id = await memory.addMemory(mem.content, mem.type, userId, mem.tags);
    if (id) {
      console.log(`Stored ${mem.type}: "${mem.content}" (${id})`);
    }
  }
}

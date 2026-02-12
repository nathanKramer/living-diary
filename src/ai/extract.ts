import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { config } from "../config.js";
import type { MemoryStore, MemoryType } from "../memory/index.js";

const EXTRACTION_PROMPT = `You are a memory extraction system for a personal diary app. Analyze the conversation and extract important information worth remembering long-term.

Return a JSON object with this exact shape:
{
  "memories": [
    {
      "content": "string — the memory to store, written in third person",
      "type": "diary_entry | user_fact",
      "tags": ["string"],
      "subject": "string — who this fact is about (see below)"
    }
  ]
}

## Memory types

- **user_fact**: A discrete, reusable fact about a person. This can be about the user themselves OR about someone the user mentions (friends, family, colleagues, etc.). Set "subject" to the person's name.
  Examples:
    - subject: "Nathan" → "Nathan works as a software engineer at Acme Corp"
    - subject: "Nathan" → "Nathan prefers tea over coffee"
    - subject: "Simon" → "Simon is an artist who sells paintings"
    - subject: "Lizzy" → "Lizzy is Nathan's sister"

- **diary_entry**: A significant event, experience, emotion, or reflection from the conversation. These are episodic — tied to a moment in time.
  Examples: "Had a stressful day at work — a production outage lasted 3 hours", "Feeling excited about starting a new side project"

## Context

You will be given existing memories as context. Use them to:
- Enrich extracted memories with known relationships and details (e.g. if you know "Lizzy is the user's sister" and the user says "Lizzy's birthday is March 5th", store "User's sister Lizzy's birthday is March 5th")
- Avoid extracting facts that are already stored
- Understand who people and things are when the user refers to them casually

## Rules

- Only extract NEW information the user is sharing for the first time
- Do NOT extract small talk, greetings, or trivial exchanges
- Do NOT extract things the AI said — only facts about or experiences of the user
- Do NOT extract information the AI recalled from memory — if the Diary is repeating back stored memories, that is not new information
- If the user is asking a question or querying past memories (e.g. "what happened on Monday?"), there is likely nothing new to extract
- NEVER extract sensitive information: passwords, API keys, secrets, tokens, credit card numbers, PINs, or other credentials. If the user shares these, ignore them completely.
- If there is nothing worth extracting, return {"memories": []}
- Keep each memory concise — one clear idea per entry
- Tags should be short topic labels: "work", "health", "relationships", "hobbies", "goals", "family", etc.

Return ONLY the JSON object, no markdown fences, no explanation.`;

interface ExtractionResult {
  memories: Array<{
    content: string;
    type: MemoryType;
    tags: string[];
    subject?: string;
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
  userName?: string,
): Promise<void> {
  // Only extract if there's enough conversation to work with
  if (recentMessages.length < 2) return;

  // Only extract from the most recent user message — older messages
  // were already extracted when they were sent
  const userMessages = recentMessages.filter((m) => m.role === "user");
  const lastMessage = userMessages[userMessages.length - 1];

  if (!lastMessage) return;

  const conversationText = lastMessage.content;

  // Fetch relevant context: all user facts + semantically related memories
  const [userFacts, related] = await Promise.all([
    memory.getUserFacts(userId),
    memory.searchMemories(conversationText, 5),
  ]);

  // Deduplicate (a related memory might also be a user fact)
  const seen = new Set<string>();
  const contextMemories: string[] = [];
  for (const m of [...userFacts, ...related]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      contextMemories.push(`- (${m.type}) ${m.content}`);
    }
  }

  const contextBlock = contextMemories.length > 0
    ? `\n\nExisting memories:\n${contextMemories.join("\n")}`
    : "";

  const userNameBlock = userName
    ? `\n\nThe user's display name (from their profile) is "${userName}". Use this for the "subject" field when extracting facts about the user. This is NOT a stored memory — if the user explicitly shares their name, still extract it as a user_fact.`
    : "";

  const { text } = await generateText({
    model: anthropic(config.aiModel),
    system: EXTRACTION_PROMPT,
    prompt: `${contextBlock}${userNameBlock}\n\nNew message from user:\n${conversationText}`,
  });

  const result = parseExtraction(text);

  if (result.memories.length === 0) return;

  // Store each extracted memory (addMemory handles dedup via vector similarity)
  for (const mem of result.memories) {
    const id = await memory.addMemory(mem.content, mem.type, userId, mem.tags, {
      source: conversationText,
      subjectName: mem.subject || undefined,
    });
    if (id) {
      console.log(`Stored ${mem.type}${mem.subject ? ` [${mem.subject}]` : ""}: "${mem.content}" (${id})`);
    }
  }
}

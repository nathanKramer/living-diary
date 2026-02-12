import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { config } from "../config.js";
import type { MemoryStore, MemoryType } from "../memory/index.js";
import type { PeopleGraphHolder } from "../people/index.js";
import type { RelationshipType } from "../shared/types.js";

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
  ],
  "people_updates": [
    {
      "name": "string — the person's primary name",
      "aliases": ["string — nicknames or alternate names, e.g. 'Mom'"],
      "bio_snippet": "string — a short factual description to add to their bio",
      "relationships": [
        {
          "related_to": "string — name of the other person",
          "type": "sibling | parent | child | partner | friend | coworker | pet | other",
          "label": "string — display label, e.g. 'sisters', 'Nathan's dog'"
        }
      ]
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

## People updates

When the user mentions people (including pets), extract structured information about them in the "people_updates" array:
- Extract the person's name and any aliases/nicknames
- Extract a brief bio snippet if new factual info is shared (job, location, age, etc.)
- Extract relationships between people (e.g. if "Lizzy is my sister", create a relationship between the user and Lizzy with type "sibling")
- Pets are treated as people with a "pet" relationship type (person1=owner, person2=pet)
- Only include people_updates when there's genuinely new information about people or relationships
- If no people info is mentioned, omit the "people_updates" field or set it to []

## Context

You will be given existing memories and known people as context. Use them to:
- Enrich extracted memories with known relationships and details (e.g. if you know "Lizzy is the user's sister" and the user says "Lizzy's birthday is March 5th", store "Lizzy's birthday is March 5th" as a user_fact for subject Lizzy)
- Avoid extracting facts that are already stored
- Avoid extracting people_updates for relationships that are already known
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

interface PeopleUpdate {
  name: string;
  aliases?: string[];
  bio_snippet?: string;
  relationships?: Array<{
    related_to: string;
    type: RelationshipType;
    label: string;
  }>;
}

interface ExtractionResult {
  memories: Array<{
    content: string;
    type: MemoryType;
    tags: string[];
    subject?: string;
  }>;
  people_updates?: PeopleUpdate[];
}

const VALID_RELATIONSHIP_TYPES = new Set<RelationshipType>([
  "sibling", "parent", "child", "partner", "friend", "coworker", "pet", "other",
]);

function parseExtraction(text: string): ExtractionResult {
  // Strip markdown fences if the model adds them despite instructions
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as ExtractionResult;

    if (!parsed.memories || !Array.isArray(parsed.memories)) {
      return { memories: [] };
    }

    // Validate each memory
    const memories = parsed.memories.filter(
      (m) =>
        typeof m.content === "string" &&
        m.content.length > 0 &&
        (m.type === "diary_entry" || m.type === "user_fact" || m.type === "photo_memory") &&
        Array.isArray(m.tags),
    );

    // Validate people_updates if present
    let people_updates: PeopleUpdate[] | undefined;
    if (Array.isArray(parsed.people_updates) && parsed.people_updates.length > 0) {
      people_updates = parsed.people_updates.filter(
        (p) => typeof p.name === "string" && p.name.length > 0,
      ).map((p) => ({
        name: p.name,
        aliases: Array.isArray(p.aliases) ? p.aliases.filter((a) => typeof a === "string") : undefined,
        bio_snippet: typeof p.bio_snippet === "string" ? p.bio_snippet : undefined,
        relationships: Array.isArray(p.relationships)
          ? p.relationships.filter(
              (r) =>
                typeof r.related_to === "string" &&
                r.related_to.length > 0 &&
                VALID_RELATIONSHIP_TYPES.has(r.type) &&
                typeof r.label === "string",
            )
          : undefined,
      }));
      if (people_updates.length === 0) people_updates = undefined;
    }

    return { memories, people_updates };
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
  peopleHolder?: PeopleGraphHolder,
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

  // Include known people context so extraction can avoid duplicates
  const peopleContext = peopleHolder?.formatPeopleContext();
  const peopleBlock = peopleContext
    ? `\n\nKnown people:\n${peopleContext}`
    : "";

  const { text } = await generateText({
    model: anthropic(config.aiModel),
    system: EXTRACTION_PROMPT,
    prompt: `${contextBlock}${peopleBlock}${userNameBlock}\n\nNew message from user:\n${conversationText}`,
  });

  const result = parseExtraction(text);

  const hasMemories = result.memories.length > 0;
  const hasPeopleUpdates = result.people_updates && result.people_updates.length > 0;

  if (!hasMemories && !hasPeopleUpdates) return;

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

  // Process people updates
  if (hasPeopleUpdates && peopleHolder) {
    for (const update of result.people_updates!) {
      const person = peopleHolder.findOrCreatePerson(update.name);

      // Merge aliases
      if (update.aliases && update.aliases.length > 0) {
        const existing = new Set(person.aliases.map((a) => a.toLowerCase()));
        for (const alias of update.aliases) {
          if (!existing.has(alias.toLowerCase()) && alias.toLowerCase() !== person.name.toLowerCase()) {
            person.aliases.push(alias);
          }
        }
      }

      // Append bio snippet
      if (update.bio_snippet) {
        if (!person.bio) {
          person.bio = update.bio_snippet;
        } else if (!person.bio.toLowerCase().includes(update.bio_snippet.toLowerCase())) {
          person.bio = `${person.bio}. ${update.bio_snippet}`;
        }
      }

      // Link Telegram user if name matches
      if (userName && person.name.toLowerCase() === userName.toLowerCase() && !person.telegramUserId) {
        person.telegramUserId = userId;
      }

      person.updatedAt = Date.now();

      // Process relationships
      if (update.relationships) {
        for (const rel of update.relationships) {
          const relatedPerson = peopleHolder.findOrCreatePerson(rel.related_to);
          peopleHolder.addRelationship(person.id, relatedPerson.id, rel.type, rel.label);
        }
      }

      console.log(`People update: ${person.name} (${person.id})`);
    }

    await peopleHolder.save();
  }
}

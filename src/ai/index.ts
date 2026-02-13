import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { config } from "../config.js";
import { buildSystemPrompt } from "./system-prompt.js";
import type { MemoryStore } from "../memory/index.js";
import type { PeopleGraphHolder } from "../people/index.js";
import type { CoreMemoryHolder } from "../core-memories/index.js";

function formatMemory(m: { content: string; timestamp: number; type: string; photoFileId?: string }): string {
  const date = new Date(m.timestamp).toISOString().split("T")[0];
  let mediaTag = "";
  if (m.photoFileId) {
    mediaTag = m.type === "video_memory"
      ? ` [videoId:${m.photoFileId}]`
      : ` [photoId:${m.photoFileId}]`;
  }
  return `[${date}] (${m.type})${mediaTag} ${m.content}`;
}

function buildMessages(
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>,
): ModelMessage[] {
  return recentMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

export async function generateDiaryResponse(
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>,
  memory: MemoryStore,
  userId: number,
  persona?: string,
  peopleHolder?: PeopleGraphHolder,
  sendMedia?: (items: Array<{ fileId: string; type: "photo" | "video"; caption?: string }>) => Promise<void>,
  coreMemoryHolder?: CoreMemoryHolder,
): Promise<string> {
  const messages = buildMessages(recentMessages);

  // Always provide memory context so the bot feels like it remembers
  const [userFacts, recentMemories] = await Promise.all([
    memory.getUserFacts(userId),
    memory.getRecentMemories(10),
  ]);

  const contextParts: string[] = [];
  if (userFacts.length > 0) {
    contextParts.push(
      "### Known facts\n" +
        userFacts.map((m) => {
          const prefix = m.subjectName ? `[${m.subjectName}] ` : "";
          return `- ${prefix}${m.content}`;
        }).join("\n"),
    );
  }
  if (recentMemories.length > 0) {
    contextParts.push(
      "### Recent memories\n" +
        recentMemories.map(formatMemory).join("\n"),
    );
  }

  // Inject people graph context
  const peopleContext = peopleHolder?.formatPeopleContext();
  if (peopleContext) {
    contextParts.push("### People you know\n" + peopleContext);
  }

  const memoryContext =
    contextParts.length > 0 ? contextParts.join("\n\n") : undefined;

  const coreMemoryContext = coreMemoryHolder?.formatForPrompt();
  const systemPrompt = buildSystemPrompt(persona, memoryContext, coreMemoryContext);
  
  const { text } = await generateText({
    model: anthropic(config.aiModel),
    system: systemPrompt,
    messages,
    tools: {
      search_memories: tool({
        description:
          "Search past memories by semantic similarity. Use this when the user asks about past events, topics, photos, or when you want to reference something from earlier conversations. This also finds photo memories by their descriptions.",
        inputSchema: z.object({
          query: z.string().describe("The search query — describe what you're looking for"),
          limit: z.number().optional().default(5).describe("Max results to return"),
        }),
        execute: async ({ query, limit }) => {
          const results = await memory.searchMemories(query, limit);
          if (results.length === 0) return "No matching memories found.";
          return results.map(formatMemory).join("\n");
        },
      }),
      search_by_date: tool({
        description:
          "Search memories by date range. Use this when the user asks about a specific date, day, week, or time period (e.g. 'what happened on February 11th', 'last Monday', 'this week').",
        inputSchema: z.object({
          startDate: z
            .string()
            .describe("Start of date range as ISO date string (e.g. '2026-02-11')"),
          endDate: z
            .string()
            .describe("End of date range (exclusive) as ISO date string (e.g. '2026-02-12')"),
        }),
        execute: async ({ startDate, endDate }) => {
          const startMs = new Date(startDate).getTime();
          const endMs = new Date(endDate).getTime();
          const results = await memory.searchByDateRange(startMs, endMs);
          if (results.length === 0) return "No memories found for that date range.";
          return results.map(formatMemory).join("\n");
        },
      }),
      get_user_facts: tool({
        description:
          "Get known facts about the current user (their preferences, background, relationships, etc.). Use this at the start of a conversation or when you need to recall who you're talking to.",
        inputSchema: z.object({}),
        execute: async () => {
          const results = await memory.getUserFacts(userId);
          if (results.length === 0) return "No known facts about this user yet.";
          return results.map((m) => m.content).join("\n");
        },
      }),
      get_recent_memories: tool({
        description:
          "Get the most recent memories across all users. Use this for general context about what's been happening lately.",
        inputSchema: z.object({
          limit: z.number().optional().default(10).describe("How many recent memories to fetch"),
        }),
        execute: async ({ limit }) => {
          const results = await memory.getRecentMemories(limit);
          if (results.length === 0) return "No memories stored yet.";
          return results.map(formatMemory).join("\n");
        },
      }),
      send_media: tool({
        description:
          "Send one or more stored photos/videos to the user. Use this when media memories appear in search results (indicated by [photoId:...] or [videoId:...]) and the user wants to see them. Collect all relevant media IDs and send them in a single call.",
        inputSchema: z.object({
          items: z.array(z.object({
            fileId: z.string().describe("The Telegram file ID from the [photoId:...] or [videoId:...] tag"),
            type: z.enum(["photo", "video"]).describe("Whether this is a photo or video"),
            caption: z.string().optional().describe("Optional caption"),
          })).min(1).describe("The media items to send"),
        }),
        execute: async ({ items }) => {
          if (!sendMedia) return "Media sending is not available in this context.";
          await sendMedia(items);
          const count = items.length;
          return `${count} item${count === 1 ? "" : "s"} sent to the user.`;
        },
      }),
      get_person_info: tool({
        description:
          "Get detailed information about a person the user knows, including their bio, relationships, and related memories. Use this when the user asks about a specific person (e.g. 'tell me about Lizzy', 'who is Simon?').",
        inputSchema: z.object({
          name: z.string().describe("The name of the person to look up"),
        }),
        execute: async ({ name }) => {
          if (!peopleHolder) return "People graph is not available.";
          const person = peopleHolder.findPersonByName(name);
          if (!person) return `No known person named "${name}".`;

          const detail = peopleHolder.formatPersonDetail(person.id) ?? "";

          // Fetch related memories by subjectName match
          const names = [person.name, ...person.aliases];
          const relatedMemories = await memory.getMemoriesBySubject(names);
          const memoryLines = relatedMemories.length > 0
            ? "\n\nRelated memories:\n" + relatedMemories.map(formatMemory).join("\n")
            : "";

          return detail + memoryLines;
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  return text;
}

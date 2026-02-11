import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { config } from "../config.js";
import { buildSystemPrompt } from "./system-prompt.js";
import type { MemoryStore } from "../memory/index.js";

function formatMemory(m: { content: string; timestamp: number; type: string }): string {
  const date = new Date(m.timestamp).toISOString().split("T")[0];
  return `[${date}] (${m.type}) ${m.content}`;
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
): Promise<string> {
  const messages = buildMessages(recentMessages);

  const { text } = await generateText({
    model: anthropic(config.aiModel),
    system: buildSystemPrompt(persona),
    messages,
    tools: {
      search_memories: tool({
        description:
          "Search past memories by semantic similarity. Use this when the user asks about past events, topics, or when you want to reference something from earlier conversations.",
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
          const results = await memory.searchMemories("", 20, {
            typeFilter: "user_fact",
            userIdFilter: userId,
          });
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
    },
    stopWhen: stepCountIs(5),
  });

  return text;
}

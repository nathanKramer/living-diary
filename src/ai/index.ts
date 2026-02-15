import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { config } from "../config.js";
import { buildSystemPrompt } from "./system-prompt.js";
import type { MemoryStore } from "../memory/index.js";
import type { PeopleGraphHolder } from "../people/index.js";
import type { CoreMemoryHolder } from "../core-memories/index.js";
import type { NotesHolder } from "../notes/index.js";

function formatMemory(m: { id?: string; content: string; timestamp: number; type: string; photoFileId?: string }): string {
  const date = new Date(m.timestamp).toISOString().split("T")[0];
  const idTag = m.id ? ` [id:${m.id}]` : "";
  let mediaTag = "";
  if (m.photoFileId) {
    mediaTag = m.type === "video_memory"
      ? ` [videoId:${m.photoFileId}]`
      : ` [photoId:${m.photoFileId}]`;
  }
  return `[${date}] (${m.type})${idTag}${mediaTag} ${m.content}`;
}

function buildMessages(
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>,
): ModelMessage[] {
  return recentMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

export interface ToolCallLog {
  toolName: string;
  args: Record<string, unknown>;
  result: string;
}

export interface DiaryResponse {
  text: string;
  toolCalls: ToolCallLog[];
}

export async function generateDiaryResponse(
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>,
  memory: MemoryStore,
  userId: number,
  persona?: string,
  peopleHolder?: PeopleGraphHolder,
  sendMedia?: (items: Array<{ fileId: string; type: "photo" | "video"; caption?: string }>) => Promise<void>,
  coreMemoryHolder?: CoreMemoryHolder,
  notesHolder?: NotesHolder,
  timezone?: string,
): Promise<DiaryResponse> {
  const messages = buildMessages(recentMessages);

  // Always provide memory context so the bot feels like it remembers
  // Over-fetch so we still get 10 after filtering out redundant entries
  const [allFacts, recentMemoriesRaw] = await Promise.all([
    memory.getAllFacts(),
    memory.getRecentMemories(30),
  ]);

  // Most recent 50 facts across all users, sorted chronologically
  allFacts.sort((a, b) => b.timestamp - a.timestamp);
  const userFacts = allFacts.slice(0, 50).reverse();

  // Filter out user_facts and conversation_summaries for the current user —
  // user_facts are already in "Known facts" and summaries duplicate the session window
  const recentMemories = recentMemoriesRaw
    .filter((m) => !((m.type === "user_fact" || m.type === "conversation_summary") && m.userId === userId))
    .slice(0, 10);

  const contextParts: string[] = [];
  if (userFacts.length > 0) {
    contextParts.push(
      "### Known facts\n" +
        userFacts.map((m) => {
          const date = new Date(m.timestamp).toISOString().split("T")[0];
          const prefix = m.subjectName ? `[${m.subjectName}] ` : "";
          return `- (${date}) ${prefix}${m.content}`;
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
  const notesContext = notesHolder?.formatForPrompt();
  const systemPrompt = buildSystemPrompt(persona, memoryContext, coreMemoryContext, notesContext, timezone);
  
  const { text, steps } = await generateText({
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
      get_recent_memories: tool({
        description:
          "Get the most recent memories across all users. Use this for general context about what's been happening lately.",
        inputSchema: z.object({
          limit: z.number().optional().default(10).describe("How many recent memories to fetch"),
        }),
        execute: async ({ limit }) => {
          const raw = await memory.getRecentMemories(limit * 3);
          const results = raw
            .filter((m) => !((m.type === "user_fact" || m.type === "conversation_summary") && m.userId === userId))
            .slice(0, limit);
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
      save_note: tool({
        description:
          "Save a note or reminder for your future self. Use this for things you want to remember to do or say later — like birthdays, follow-ups, or promises you made. NOT for storing memories about the user (those are extracted automatically).",
        inputSchema: z.object({
          content: z.string().describe("The note or reminder content"),
        }),
        execute: async ({ content }) => {
          if (!notesHolder) return "Notes are not available.";
          const note = notesHolder.addNote(content);
          if (!note) return "Notes limit reached — complete some existing notes first.";
          await notesHolder.save();
          return `Note saved (id: ${note.id}).`;
        },
      }),
      complete_note: tool({
        description:
          "Mark a note as complete and remove it. Use this after you've acted on a reminder (e.g. wished someone happy birthday, followed up on something).",
        inputSchema: z.object({
          note_id: z.string().describe("The ID of the note to complete"),
        }),
        execute: async ({ note_id }) => {
          if (!notesHolder) return "Notes are not available.";
          const removed = notesHolder.removeNote(note_id);
          if (!removed) return "Note not found — it may have already been completed.";
          await notesHolder.save();
          return "Note completed and removed.";
        },
      }),
      forget_memory: tool({
        description:
          "Delete outdated or incorrect memories by their IDs. Use this when you notice a stored fact contradicts what the user just told you (e.g. old job, old city, corrected detail). First use search_memories to find the outdated memory and note its [id:...] tag, then pass the specific ID(s) here.",
        inputSchema: z.object({
          memory_ids: z.array(z.string()).min(1).describe("The IDs of memories to delete (from [id:...] tags in search results)"),
          reason: z.string().describe("Brief reason for deletion (e.g. 'user corrected: now works at Google')"),
        }),
        execute: async ({ memory_ids, reason }) => {
          for (const id of memory_ids) {
            await memory.deleteMemory(id);
          }
          console.log(`forget_memory: deleted ${memory_ids.length} — ${reason}`);
          return `Deleted ${memory_ids.length} ${memory_ids.length === 1 ? "memory" : "memories"}.`;
        },
      }),
    },
    stopWhen: stepCountIs(10),
  });

  // Extract tool call logs from all steps
  const toolCallLogs: ToolCallLog[] = [];
  for (const step of steps) {
    for (const result of step.toolResults) {
      toolCallLogs.push({
        toolName: result.toolName,
        args: result.input as Record<string, unknown>,
        result: String(result.output),
      });
    }
  }

  return { text, toolCalls: toolCallLogs };
}

const MEDIA_REPLY_PROMPT = `You are a personal diary companion responding to a photo or video the user just shared. Be extremely concise — one short sentence at most. React naturally to what you see or what they said, like a friend would. No descriptions, no questions, no filler. Just a brief warm acknowledgment.`;

export async function generateMediaReply(
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  const messages = buildMessages(recentMessages);

  const { text } = await generateText({
    model: anthropic(config.aiModel),
    system: MEDIA_REPLY_PROMPT,
    messages,
  });

  return text;
}

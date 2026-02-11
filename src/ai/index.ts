import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { config } from "../config.js";
import { buildSystemPrompt } from "./system-prompt.js";

export interface MemoryContext {
  relevantMemories: string[];
  userFacts: string[];
}

function buildMessages(
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>,
  memoryContext: MemoryContext,
): ModelMessage[] {
  const messages: ModelMessage[] = [];

  // Inject memory context as a system-adjacent user message at the start
  const memoryParts: string[] = [];

  if (memoryContext.userFacts.length > 0) {
    memoryParts.push(
      "## Things I know about you\n" + memoryContext.userFacts.join("\n"),
    );
  }

  if (memoryContext.relevantMemories.length > 0) {
    memoryParts.push(
      "## Relevant memories from past conversations\n" +
        memoryContext.relevantMemories.join("\n---\n"),
    );
  }

  if (memoryParts.length > 0) {
    messages.push({
      role: "user",
      content:
        "[MEMORY CONTEXT — use naturally, don't reference this block directly]\n\n" +
        memoryParts.join("\n\n"),
    });
    messages.push({
      role: "assistant",
      content: "Thank you, I'll keep that context in mind.",
    });
  }

  // Add recent conversation turns
  for (const msg of recentMessages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  return messages;
}

export async function generateDiaryResponse(
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>,
  memoryContext: MemoryContext,
  persona?: string,
): Promise<string> {
  const messages = buildMessages(recentMessages, memoryContext);

  const { text } = await generateText({
    model: anthropic(config.aiModel),
    system: buildSystemPrompt(persona),
    messages,
  });

  return text;
}

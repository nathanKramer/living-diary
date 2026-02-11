import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { config } from "../config.js";

const CONFIGURE_PROMPT = `You are a prompt engineer. The user will describe how they want to use a memory-powered AI bot. Your job is to generate a persona section for the bot's system prompt.

The bot already has these core behaviors built in (do NOT repeat these):
- It remembers past conversations and references them naturally
- It keeps responses conversational
- It can only listen, remember, and reflect (no external actions)

Generate a persona that covers:
1. **Role**: What the bot is (e.g. "family diary", "company knowledge keeper", "personal coach")
2. **Tone & style**: How it should communicate (formal, casual, warm, professional, etc.)
3. **Behavior**: Specific behaviors for this use case (what to ask about, what to focus on, what to avoid)
4. **Boundaries**: What the bot should NOT do in this context

Format the output as a system prompt section using markdown headers (## Your role, ## How you behave, etc.).

Return ONLY the persona text. No preamble, no explanation, no markdown fences.`;

export async function generatePersona(userDescription: string): Promise<string> {
  const { text } = await generateText({
    model: anthropic(config.aiModel),
    system: CONFIGURE_PROMPT,
    prompt: userDescription,
  });

  return text.trim();
}

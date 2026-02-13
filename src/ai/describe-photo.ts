import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { config } from "../config.js";
import type { Person } from "../shared/types.js";

const PHOTO_DESCRIPTION_PROMPT = `You are a diary assistant describing a photo for long-term memory storage. Describe what you see in detail, focusing on:

- Who or what is in the photo
- Where it appears to be (location, setting)
- What's happening (activity, event, mood)
- Any notable details (food, objects, weather, expressions)

Write in third person about the user (e.g. "The user is at a cafe with a friend"). Be descriptive but concise — aim for 1-3 sentences. If a caption is provided, use it as context to enrich the description.`;

export async function describePhoto(
  imageBuffer: Buffer,
  caption?: string,
): Promise<string> {
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Buffer; mimeType: "image/jpeg" }
  > = [
    { type: "image", image: imageBuffer, mimeType: "image/jpeg" },
  ];

  if (caption) {
    userContent.push({
      type: "text",
      text: `The user sent this photo with the caption: "${caption}"`,
    });
  } else {
    userContent.push({
      type: "text",
      text: "Describe this photo for the user's diary.",
    });
  }

  const { text } = await generateText({
    model: anthropic(config.aiModel),
    system: PHOTO_DESCRIPTION_PROMPT,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
  });

  return text;
}

const IDENTIFY_PEOPLE_PROMPT = `You are a helper for a personal diary app. Given a photo caption, identify which people from the known list are mentioned or referred to — including indirect references like "me", "mum", "my brother", nicknames, etc.

Return ONLY a raw JSON array of the canonical names of people you identify. For example: ["Nathan", "Bridget"]
If no known people are referenced, return an empty array: []

Do NOT invent people. Only return names from the provided list.
Do NOT wrap the response in markdown code fences or any other formatting — raw JSON only.`;

/**
 * Use the LLM to identify which known people are mentioned in a photo's
 * caption, handling indirect references like "me", "mum", etc.
 */
export async function identifyPeopleInPhoto(
  caption: string,
  people: Person[],
  senderUserId?: number,
): Promise<string[]> {
  if (people.length === 0) return [];

  const peopleList = people
    .map((p) => {
      const aliases = p.aliases.length > 0 ? ` (aliases: ${p.aliases.join(", ")})` : "";
      const isUser = p.telegramUserId === senderUserId ? " ← this is the user sending the photo" : "";
      return `- ${p.name}${aliases}${isUser}`;
    })
    .join("\n");


  const peopleAndCaption = `Known people:\n${peopleList}\n\nCaption: ${caption}`;

  const { text } = await generateText({
    model: anthropic(config.aiModel),
    system: IDENTIFY_PEOPLE_PROMPT,
    messages: [
      {
        role: "user",
        content: peopleAndCaption,
      },
    ],
  });

  try {
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      const knownNames = new Set(people.map((p) => p.name));
      return parsed.filter((n): n is string => typeof n === "string" && knownNames.has(n));
    }
  } catch {
    console.error("Failed to parse identifyPeople response:", text);
  }
  return [];
}

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { config } from "../config.js";

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

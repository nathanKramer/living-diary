import { Bot, Context, session } from "grammy";
import { config } from "../config.js";
import { generateDiaryResponse } from "../ai/index.js";
import type { MemoryStore } from "../memory/index.js";
import { extractAndStoreMemories } from "../ai/extract.js";
import { generatePersona } from "../ai/configure.js";
import { loadPersona, savePersona } from "../persona/index.js";
import type { Persona } from "../persona/index.js";

export interface SessionData {
  /** Recent conversation turns for short-term context */
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
}

function initialSessionData(): SessionData {
  return { recentMessages: [] };
}

export type BotContext = Context & { session: SessionData };

export function createBot(memory: MemoryStore, initialPersona: Persona | null): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.telegramBotToken);
  let currentPersona = initialPersona;

  // Session middleware for short-term memory
  bot.use(session({ initial: initialSessionData }));

  // Only respond to allowed users
  bot.use(async (ctx, next) => {
    if (!ctx.from || !config.allowedUserIds.includes(ctx.from.id)) {
      console.log(`Ignored message from unauthorized user: ${ctx.from?.id}`);
      return;
    }
    await next();
  });

  // Commands
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Hello! I'm your living diary. Tell me about your day, your thoughts, " +
        "or anything on your mind. I'll remember what matters and reflect it back to you over time.\n\n" +
        "Just send me a message to start journaling, or use /help to see what I can do."
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Here's what I can do:\n\n" +
        "/start — Welcome message\n" +
        "/help — This message\n" +
        "/search <query> — Search your memories\n" +
        "/forget <query> — Delete matching memories\n" +
        "/export — Download all your data\n" +
        "/stats — Memory statistics\n" +
        "/pause — Stop proactive messages\n" +
        "/resume — Resume proactive messages\n" +
        "/delete_all — Delete everything (careful!)\n" +
        "/configure <description> — Change how I behave\n" +
        "/persona — Show current persona\n\n" +
        "Or just send me a message and we'll talk."
    );
  });

  bot.command("configure", async (ctx) => {
    const description = ctx.match;
    if (!description) {
      await ctx.reply(
        "Tell me how you'd like to use me. Examples:\n\n" +
          "/configure A personal diary for reflecting on my day\n" +
          "/configure A family diary shared between me, my wife, and our kids\n" +
          "/configure A company knowledge base that remembers decisions and context",
      );
      return;
    }

    await ctx.replyWithChatAction("typing");

    try {
      const systemPromptAddition = await generatePersona(description);
      const persona: Persona = {
        description,
        systemPromptAddition,
        updatedAt: Date.now(),
      };
      await savePersona(persona);
      currentPersona = persona;

      await ctx.reply(
        `Got it! I've updated my persona based on: "${description}"\n\n` +
          "Here's how I'll behave now:\n\n" +
          systemPromptAddition +
          "\n\nUse /persona to review this, or /configure again to change it.",
      );
    } catch (err) {
      console.error("Persona generation failed:", err);
      await ctx.reply("Sorry, I had trouble generating a new persona. Try again.");
    }
  });

  bot.command("persona", async (ctx) => {
    if (!currentPersona) {
      await ctx.reply(
        "I'm using the default persona (personal diary companion).\n\n" +
          "Use /configure <description> to customize how I behave.",
      );
      return;
    }

    await ctx.reply(
      `Current configuration: "${currentPersona.description}"\n\n` +
        currentPersona.systemPromptAddition,
    );
  });

  // Main message handler
  bot.on("message:text", async (ctx) => {
    const userMessage = ctx.message.text;
    console.log(`Message from ${ctx.from.id}: ${userMessage}`);

    // Store in session short-term memory
    ctx.session.recentMessages.push({ role: "user", content: userMessage });

    // Keep only last 20 turns
    const maxTurns = 20;
    if (ctx.session.recentMessages.length > maxTurns) {
      ctx.session.recentMessages = ctx.session.recentMessages.slice(-maxTurns);
    }

    // Show typing indicator while generating
    await ctx.replyWithChatAction("typing");

    const userId = ctx.from.id;

    try {
      const response = await generateDiaryResponse(
        ctx.session.recentMessages,
        memory,
        userId,
        currentPersona?.systemPromptAddition,
      );

      // Store assistant response in short-term memory
      ctx.session.recentMessages.push({ role: "assistant", content: response });

      await ctx.reply(response);

      // Extract and store memories in the background (don't block the reply)
      extractAndStoreMemories(
        ctx.session.recentMessages,
        [],
        memory,
        userId,
      ).catch((err) => console.error("Memory extraction failed:", err));
    } catch (err) {
      console.error("AI generation failed:", err);
      await ctx.reply(
        "Sorry, I had trouble thinking of a response. Try again in a moment.",
      );
    }
  });

  return bot;
}

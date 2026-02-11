import { Bot, Context, session } from "grammy";
import { config } from "../config.js";

export interface SessionData {
  /** Recent conversation turns for short-term context */
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
}

function initialSessionData(): SessionData {
  return { recentMessages: [] };
}

export type BotContext = Context & { session: SessionData };

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.telegramBotToken);

  // Session middleware for short-term memory
  bot.use(session({ initial: initialSessionData }));

  // Only respond to the allowed user
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== config.allowedUserId) {
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
        "/delete_all — Delete everything (careful!)\n\n" +
        "Or just send me a message and we'll talk."
    );
  });

  // Main message handler — will be wired to AI in Task 4
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

    // TODO: Replace with AI response (Task 4)
    await ctx.reply(
      "I heard you! (AI responses coming soon — for now I'm just a scaffold.)"
    );
  });

  return bot;
}

import { Bot, Context, InputFile, InlineKeyboard, session } from "grammy";
import { config } from "../config.js";
import { generateDiaryResponse } from "../ai/index.js";
import type { MemoryStore } from "../memory/index.js";
import { extractAndStoreMemories } from "../ai/extract.js";
import { generatePersona } from "../ai/configure.js";
import { describePhoto, identifyPeopleInPhoto } from "../ai/describe-photo.js";
import { savePersona, PersonaHolder } from "../persona/index.js";
import type { Persona } from "../persona/index.js";
import type { PeopleGraphHolder } from "../people/index.js";
import type { AllowlistHolder } from "../allowlist/index.js";
import type { CoreMemoryHolder } from "../core-memories/index.js";
import type { NotesHolder } from "../notes/index.js";
import { type TimezoneHolder, isValidTimezone } from "../timezones/index.js";
import { appendLog, appendLogs, readRecentLogs } from "../chat-logs/index.js";
import type { LogEntry } from "../chat-logs/index.js";

const pendingDeletes = new Map<number, string[]>();

// Rate limiting: track API calls per user per hour
const rateLimitMap = new Map<number, { count: number; resetAt: number }>();
const MAX_MESSAGES_PER_HOUR = 60;

function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }

  if (entry.count >= MAX_MESSAGES_PER_HOUR) {
    return false;
  }

  entry.count++;
  return true;
}

export interface SessionData {
  /** Recent conversation turns for short-term context */
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
}

function initialSessionData(): SessionData {
  return { recentMessages: [] };
}

export type BotContext = Context & { session: SessionData };

export function createBot(memory: MemoryStore, personaHolder: PersonaHolder, peopleHolder: PeopleGraphHolder, allowlist: AllowlistHolder, coreMemoryHolder: CoreMemoryHolder, notesHolder: NotesHolder, timezoneHolder: TimezoneHolder): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.telegramBotToken);

  // --- Approval callback queries (registered before auth middleware) ---

  bot.callbackQuery(/^approve:(\d+)$/, async (ctx) => {
    if (ctx.from.id !== config.adminTelegramId) {
      await ctx.answerCallbackQuery({ text: "Only the admin can do this." });
      return;
    }

    const userId = Number(ctx.match[1]);
    await allowlist.approve(userId);

    try {
      await ctx.api.sendMessage(userId, "✅ You've been approved! You can start using the bot.");
    } catch (err) {
      console.error(`Failed to notify approved user ${userId}:`, err);
    }

    const original = ctx.callbackQuery.message?.text ?? "";
    await ctx.editMessageText(`${original}\n\n✅ Approved`);
    await ctx.answerCallbackQuery({ text: "User approved" });
  });

  bot.callbackQuery(/^reject:(\d+)$/, async (ctx) => {
    if (ctx.from.id !== config.adminTelegramId) {
      await ctx.answerCallbackQuery({ text: "Only the admin can do this." });
      return;
    }

    const userId = Number(ctx.match[1]);
    await allowlist.reject(userId);

    try {
      await ctx.api.sendMessage(userId, "Sorry, your request wasn't approved.");
    } catch (err) {
      console.error(`Failed to notify rejected user ${userId}:`, err);
    }

    const original = ctx.callbackQuery.message?.text ?? "";
    await ctx.editMessageText(`${original}\n\n❌ Rejected`);
    await ctx.answerCallbackQuery({ text: "User rejected" });
  });

  // Session middleware for short-term memory
  bot.use(session({ initial: initialSessionData }));

  // Session hydration — load chat history from disk when session is empty (e.g. after restart)
  bot.use(async (ctx, next) => {
    if (ctx.session.recentMessages.length === 0 && ctx.from) {
      ctx.session.recentMessages = await readRecentLogs(ctx.from.id, 20);
    }
    await next();
  });

  // Allowlist gate — approved users pass through, others get a pending request
  bot.use(async (ctx, next) => {
    if (!ctx.from) return;

    const userId = ctx.from.id;

    if (allowlist.isApproved(userId)) {
      await next();
      return;
    }

    if (allowlist.isPending(userId)) {
      // Already requested — don't re-notify admin
      return;
    }

    // New unapproved user — store request and notify admin
    allowlist.addPendingRequest({
      userId,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      username: ctx.from.username,
    });
    await allowlist.save();

    await ctx.reply("👋 Welcome! Your access request has been sent to the admin. You'll be notified when approved.");

    const nameParts = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ");
    const usernamePart = ctx.from.username ? ` (@${ctx.from.username})` : "";
    const text = `🔔 New access request:\n\nName: ${nameParts}${usernamePart}\nUser ID: ${userId}`;

    const keyboard = new InlineKeyboard()
      .text("✅ Approve", `approve:${userId}`)
      .text("❌ Reject", `reject:${userId}`);

    await ctx.api.sendMessage(config.adminTelegramId, text, { reply_markup: keyboard });
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
        "/persona — Show current persona\n" +
        "/name <name> — Set or view my name\n" +
        "/timezone <tz> — Set your timezone (e.g. Australia/Sydney)\n\n" +
        "You can also send me photos and I'll remember them too.\n\n" +
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
      personaHolder.current = persona;

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
    if (!personaHolder.current) {
      await ctx.reply(
        "I'm using the default persona (personal diary companion).\n\n" +
          "Use /configure <description> to customize how I behave.",
      );
      return;
    }

    await ctx.reply(
      `Current configuration: "${personaHolder.current.description}"\n\n` +
        personaHolder.current.systemPromptAddition,
    );
  });

  bot.command("name", async (ctx) => {
    const newName = ctx.match;
    if (!newName) {
      const current = coreMemoryHolder.current.name;
      if (current) {
        await ctx.reply(`My name is ${current}. Use /name <new name> to change it.`);
      } else {
        await ctx.reply("I don't have a name yet. Use /name <name> to give me one.");
      }
      return;
    }

    coreMemoryHolder.setName(newName.trim());
    await coreMemoryHolder.save();
    await ctx.reply(`Got it! You can call me ${newName.trim()} from now on.`);
  });

  bot.command("timezone", async (ctx) => {
    const tz = ctx.match;
    if (!tz) {
      const current = timezoneHolder.get(ctx.from!.id);
      if (current) {
        await ctx.reply(`Your timezone is set to ${current}. Use /timezone <tz> to change it.\n\nExample: /timezone Australia/Sydney`);
      } else {
        await ctx.reply("No timezone set (using server default). Use /timezone <tz> to set one.\n\nExample: /timezone Australia/Sydney");
      }
      return;
    }

    const trimmed = tz.trim();
    if (!isValidTimezone(trimmed)) {
      await ctx.reply(`"${trimmed}" is not a valid timezone. Use an IANA timezone like Australia/Sydney, America/New_York, or Europe/London.`);
      return;
    }

    await timezoneHolder.set(ctx.from!.id, trimmed);
    await ctx.reply(`Timezone set to ${trimmed}.`);
  });

  bot.command("search", async (ctx) => {
    const query = ctx.match;
    if (!query) {
      await ctx.reply("Usage: /search <query>\n\nExample: /search that trip last summer");
      return;
    }

    await ctx.replyWithChatAction("typing");

    try {
      const results = await memory.searchMemories(query, 10);
      if (results.length === 0) {
        await ctx.reply("No matching memories found.");
        return;
      }

      const lines = results.map((m, i) => {
        const date = new Date(m.timestamp).toISOString().split("T")[0];
        return `${i + 1}. [${date}] (${m.type}) ${m.content}`;
      });
      await ctx.reply(lines.join("\n\n"));
    } catch (err) {
      console.error("Search failed:", err);
      await ctx.reply("Sorry, the search failed. Try again.");
    }
  });

  bot.command("forget", async (ctx) => {
    const query = ctx.match;
    if (!query) {
      await ctx.reply("Usage: /forget <query>\n\nI'll find matching memories and ask you to confirm before deleting.");
      return;
    }

    await ctx.replyWithChatAction("typing");

    try {
      const results = await memory.searchMemories(query, 5);
      if (results.length === 0) {
        await ctx.reply("No matching memories found.");
        return;
      }

      const userId = ctx.from!.id;
      const ids = results.map((m) => m.id);
      pendingDeletes.set(userId, ids);

      const lines = results.map((m, i) => {
        const date = new Date(m.timestamp).toISOString().split("T")[0];
        return `${i + 1}. [${date}] (${m.type}) ${m.content}`;
      });

      await ctx.reply(
        "Found these memories:\n\n" +
          lines.join("\n\n") +
          "\n\nSend /confirm_forget to delete all of these, or /cancel to keep them.",
      );
    } catch (err) {
      console.error("Forget search failed:", err);
      await ctx.reply("Sorry, the search failed. Try again.");
    }
  });

  bot.command("confirm_forget", async (ctx) => {
    const userId = ctx.from!.id;
    const ids = pendingDeletes.get(userId);
    if (!ids || ids.length === 0) {
      await ctx.reply("Nothing to forget. Use /forget <query> first.");
      return;
    }

    for (const id of ids) {
      await memory.deleteMemory(id);
    }
    pendingDeletes.delete(userId);

    await ctx.reply(`Deleted ${ids.length} ${ids.length === 1 ? "memory" : "memories"}.`);
  });

  bot.command("cancel", async (ctx) => {
    const userId = ctx.from!.id;
    if (pendingDeletes.has(userId)) {
      pendingDeletes.delete(userId);
      await ctx.reply("Cancelled. No memories were deleted.");
    }
  });

  bot.command("export", async (ctx) => {
    await ctx.replyWithChatAction("typing");

    try {
      const all = await memory.exportAll();
      const json = JSON.stringify(all, null, 2);
      const buffer = Buffer.from(json, "utf-8");

      await ctx.replyWithDocument(
        new InputFile(buffer, "living-diary-export.json"),
        { caption: `Exported ${all.length} memories.` },
      );
    } catch (err) {
      console.error("Export failed:", err);
      await ctx.reply("Sorry, the export failed. Try again.");
    }
  });

  bot.command("stats", async (ctx) => {
    try {
      const all = await memory.exportAll();
      const total = all.length;

      if (total === 0) {
        await ctx.reply("No memories stored yet. Start talking to me!");
        return;
      }

      const byType: Record<string, number> = {};
      let oldest = Infinity;
      let newest = 0;

      for (const m of all) {
        byType[m.type] = (byType[m.type] ?? 0) + 1;
        if (m.timestamp < oldest) oldest = m.timestamp;
        if (m.timestamp > newest) newest = m.timestamp;
      }

      const typeLines = Object.entries(byType)
        .map(([type, count]) => `  ${type}: ${count}`)
        .join("\n");

      await ctx.reply(
        `Total memories: ${total}\n\n` +
          `By type:\n${typeLines}\n\n` +
          `Oldest: ${new Date(oldest).toISOString().split("T")[0]}\n` +
          `Newest: ${new Date(newest).toISOString().split("T")[0]}`,
      );
    } catch (err) {
      console.error("Stats failed:", err);
      await ctx.reply("Sorry, couldn't fetch stats. Try again.");
    }
  });

  bot.command("delete_all", async (ctx) => {
    await ctx.reply(
      "This will permanently delete ALL memories for ALL users. This cannot be undone.\n\n" +
        "Send /confirm_delete_all to proceed, or /cancel to abort.",
    );
  });

  bot.command("confirm_delete_all", async (ctx) => {
    try {
      const count = await memory.countMemories();
      await memory.deleteAll();
      await ctx.reply(`Deleted all ${count} memories. Starting fresh.`);
    } catch (err) {
      console.error("Delete all failed:", err);
      await ctx.reply("Sorry, the deletion failed. Try again.");
    }
  });

  // Photo message handler
  bot.on("message:photo", async (ctx) => {
    console.log(`Photo from ${ctx.from.id}`);

    if (!checkRateLimit(ctx.from.id)) {
      await ctx.reply("You've sent a lot of messages this hour. Take a breather and try again soon.");
      return;
    }

    await ctx.replyWithChatAction("typing");

    const userId = ctx.from.id;
    const caption = ctx.message.caption;

    try {
      // Get the largest photo size (last in the array)
      const photo = ctx.message.photo[ctx.message.photo.length - 1]!;
      const file = await ctx.api.getFile(photo.file_id);
      const url = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download photo: ${response.status}`);
      }
      const imageBuffer = Buffer.from(await response.arrayBuffer());

      // Get AI description of the photo
      const description = await describePhoto(imageBuffer, caption ?? undefined);

      // Use LLM to identify people mentioned in the caption
      const mentionedNames = caption
        ? await identifyPeopleInPhoto(caption, peopleHolder.current.people, userId)
        : [];
      const subjectName = mentionedNames.length > 0
        ? mentionedNames.join(", ")
        : undefined;

      // Store as photo memory
      const memId = await memory.addMemory(
        description,
        "photo_memory",
        userId,
        ["photo"],
        { photoFileId: photo.file_id, source: caption ?? undefined, subjectName },
      );

      if (memId) {
        console.log(`Stored photo_memory: "${description}" (${memId})`);
      }

      // Add to session for conversational context
      const sessionText = caption
        ? `[User sent a photo with caption: "${caption}"] AI description: ${description}`
        : `[User sent a photo] AI description: ${description}`;
      ctx.session.recentMessages.push({ role: "user", content: sessionText });
      appendLog(userId, "user", sessionText);

      // Keep only last 20 turns
      const maxTurns = 20;
      if (ctx.session.recentMessages.length > maxTurns) {
        ctx.session.recentMessages = ctx.session.recentMessages.slice(-maxTurns);
      }

      const photoReply = `Got it! Here's what I see:\n\n${description}`;
      ctx.session.recentMessages.push({ role: "assistant", content: photoReply });
      appendLog(userId, "assistant", photoReply);

      // Keep only last 20 turns
      if (ctx.session.recentMessages.length > maxTurns) {
        ctx.session.recentMessages = ctx.session.recentMessages.slice(-maxTurns);
      }

      await ctx.reply(photoReply);
    } catch (err) {
      console.error("Photo processing failed:", err);
      await ctx.reply("Sorry, I had trouble processing that photo. Try again.");
    }
  });

  // Video message handler
  bot.on("message:video", async (ctx) => {
    console.log(`Video from ${ctx.from.id}`);

    if (!checkRateLimit(ctx.from.id)) {
      await ctx.reply("You've sent a lot of messages this hour. Take a breather and try again soon.");
      return;
    }

    await ctx.replyWithChatAction("typing");

    const userId = ctx.from.id;
    const caption = ctx.message.caption;

    try {
      const video = ctx.message.video;
      const description = caption ?? "Video shared by the user";

      // Use LLM to identify people mentioned in the caption
      const mentionedNames = caption
        ? await identifyPeopleInPhoto(caption, peopleHolder.current.people, userId)
        : [];
      const subjectName = mentionedNames.length > 0
        ? mentionedNames.join(", ")
        : undefined;

      // Store as video memory
      const memId = await memory.addMemory(
        description,
        "video_memory",
        userId,
        ["video"],
        { photoFileId: video.file_id, source: caption ?? undefined, subjectName },
      );

      if (memId) {
        console.log(`Stored video_memory: "${description}" (${memId})`);
      }

      // Add to session for conversational context
      const sessionText = caption
        ? `[User sent a video with caption: "${caption}"]`
        : `[User sent a video]`;
      ctx.session.recentMessages.push({ role: "user", content: sessionText });
      appendLog(userId, "user", sessionText);

      // Keep only last 20 turns
      const maxTurns = 20;
      if (ctx.session.recentMessages.length > maxTurns) {
        ctx.session.recentMessages = ctx.session.recentMessages.slice(-maxTurns);
      }

      const videoReply = `Got it! I've saved that video${caption ? ` with your caption.` : "."}`;
      ctx.session.recentMessages.push({ role: "assistant", content: videoReply });
      appendLog(userId, "assistant", videoReply);

      // Keep only last 20 turns
      if (ctx.session.recentMessages.length > maxTurns) {
        ctx.session.recentMessages = ctx.session.recentMessages.slice(-maxTurns);
      }

      await ctx.reply(videoReply);
    } catch (err) {
      console.error("Video processing failed:", err);
      await ctx.reply("Sorry, I had trouble processing that video. Try again.");
    }
  });

  // Main message handler
  bot.on("message:text", async (ctx) => {
    const userMessage = ctx.message.text;
    console.log(`Message from ${ctx.from.id}: ${userMessage}`);

    const userId = ctx.from.id;

    if (!checkRateLimit(userId)) {
      await ctx.reply("You've sent a lot of messages this hour. Take a breather and try again soon.");
      return;
    }

    // Store in session short-term memory
    ctx.session.recentMessages.push({ role: "user", content: userMessage });
    appendLog(userId, "user", userMessage);

    // Keep only last 20 turns
    const maxTurns = 20;
    if (ctx.session.recentMessages.length > maxTurns) {
      ctx.session.recentMessages = ctx.session.recentMessages.slice(-maxTurns);
    }

    // Show typing indicator while generating
    await ctx.replyWithChatAction("typing");

    try {
      const { text: response, toolCalls } = await generateDiaryResponse(
        ctx.session.recentMessages,
        memory,
        userId,
        personaHolder.current?.systemPromptAddition,
        peopleHolder,
        async (items) => {
          // sendMedia callback
          if (items.length === 1) {
            const item = items[0]!;
            const opts = item.caption ? { caption: item.caption } : undefined;
            if (item.type === "video") {
              await ctx.replyWithVideo(item.fileId, opts);
            } else {
              await ctx.replyWithPhoto(item.fileId, opts);
            }
          } else {
            await ctx.replyWithMediaGroup(
              items.map((item) => ({
                type: item.type as "photo" | "video",
                media: item.fileId,
                caption: item.caption,
              })),
            );
          }
        },
        coreMemoryHolder,
        notesHolder,
        timezoneHolder.get(userId),
      );

      // Log tool calls + assistant response in a single write to guarantee ordering
      const now = Date.now();
      const logEntries: LogEntry[] = toolCalls.map((tc) => ({
        role: "tool" as const,
        content: JSON.stringify(tc.args),
        timestamp: now,
        toolName: tc.toolName,
        toolArgs: tc.args,
        toolResult: tc.result,
      }));
      logEntries.push({ role: "assistant", content: response, timestamp: now });
      appendLogs(userId, logEntries);

      // Store assistant response in short-term memory
      ctx.session.recentMessages.push({ role: "assistant", content: response });

      await ctx.reply(response);

      // Extract and store memories in the background (don't block the reply)
      const savedNotes = toolCalls
        .filter((tc) => tc.toolName === "save_note")
        .map((tc) => String(tc.args.content));
      extractAndStoreMemories(
        ctx.session.recentMessages,
        memory,
        userId,
        ctx.from.first_name,
        peopleHolder,
        coreMemoryHolder,
        savedNotes,
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

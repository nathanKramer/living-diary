import { config } from "./config.js";
import { createBot } from "./bot/index.js";
import { MemoryStore } from "./memory/index.js";
import { loadPersona } from "./persona/index.js";

async function main() {
  console.log("Living Diary starting...");
  console.log(`Model: ${config.aiModel}`);
  console.log(`Data dir: ${config.dataDir}`);
  console.log(`Allowed users: ${config.allowedUserIds.join(", ")}`);

  const memory = new MemoryStore();
  await memory.init();

  const persona = await loadPersona();
  if (persona) {
    console.log(`Persona loaded: "${persona.description}"`);
  } else {
    console.log("No persona configured, using default. Use /configure to set one.");
  }

  const bot = createBot(memory, persona);

  // Graceful shutdown
  const shutdown = () => {
    console.log("Shutting down...");
    bot.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Register commands for Telegram's menu button
  await bot.api.setMyCommands([
    { command: "start", description: "Welcome message" },
    { command: "help", description: "List all commands" },
    { command: "configure", description: "Change how I behave" },
    { command: "persona", description: "Show current persona" },
    { command: "search", description: "Search your memories" },
    { command: "stats", description: "Memory statistics" },
    { command: "export", description: "Download all your data" },
    { command: "forget", description: "Delete matching memories" },
    { command: "pause", description: "Stop proactive messages" },
    { command: "resume", description: "Resume proactive messages" },
    { command: "delete_all", description: "Delete everything" },
  ]);

  // TODO: Initialize scheduler (Task 6)

  console.log("Living Diary is ready. Listening for messages...");
  await bot.start();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

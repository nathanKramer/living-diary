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

  // TODO: Initialize scheduler (Task 6)

  console.log("Living Diary is ready. Listening for messages...");
  await bot.start();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

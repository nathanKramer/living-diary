import { config } from "./config.js";
import { createBot } from "./bot/index.js";
import { MemoryStore } from "./memory/index.js";
import { loadPersona, PersonaHolder } from "./persona/index.js";
import { loadPeopleGraph, PeopleGraphHolder } from "./people/index.js";
import { loadAllowlist, AllowlistHolder } from "./allowlist/index.js";
import { loadCoreMemories, CoreMemoryHolder } from "./core-memories/index.js";
import { loadNotes, NotesHolder } from "./notes/index.js";
import { loadTimezones, TimezoneHolder } from "./timezones/index.js";
import { startServer } from "./server/index.js";

async function main() {
  console.log("Living Diary starting...");
  console.log(`Model: ${config.aiModel}`);
  console.log(`Data dir: ${config.dataDir}`);
  console.log(`Admin: ${config.adminTelegramId}`);

  const memory = new MemoryStore();
  await memory.init();

  const persona = await loadPersona();
  const personaHolder = new PersonaHolder(persona);
  if (persona) {
    console.log(`Persona loaded: "${persona.description}"`);
  } else {
    console.log("No persona configured, using default. Use /configure to set one.");
  }

  const peopleGraph = await loadPeopleGraph();
  const peopleHolder = new PeopleGraphHolder(peopleGraph);
  console.log(`People graph loaded: ${peopleGraph.people.length} people, ${peopleGraph.relationships.length} relationships`);

  const coreMemories = await loadCoreMemories();
  const coreMemoryHolder = new CoreMemoryHolder(coreMemories);
  if (coreMemories.name) {
    console.log(`Core memories loaded: name="${coreMemories.name}", ${coreMemories.entries.length} entries`);
  } else {
    console.log(`Core memories loaded: no name, ${coreMemories.entries.length} entries`);
  }

  const notesData = await loadNotes();
  const notesHolder = new NotesHolder(notesData);
  console.log(`Notes loaded: ${notesData.notes.length} notes`);

  const timezoneData = await loadTimezones();
  const timezoneHolder = new TimezoneHolder(timezoneData);
  console.log(`Timezones loaded: ${Object.keys(timezoneData).length} users`);

  // Load allowlist and seed from env
  const allowlistData = await loadAllowlist();
  const allowlistHolder = new AllowlistHolder(allowlistData);
  if (config.allowedUserIds.length > 0) {
    allowlistHolder.seedFromEnv(config.allowedUserIds);
    await allowlistHolder.save();
  }
  console.log(`Allowlist: ${allowlistHolder.current.approvedUserIds.length} approved, ${allowlistHolder.current.pendingRequests.length} pending`);

  // Start web dashboard
  startServer(memory, personaHolder, peopleHolder, coreMemoryHolder, notesHolder);

  const bot = createBot(memory, personaHolder, peopleHolder, allowlistHolder, coreMemoryHolder, notesHolder, timezoneHolder);

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
    { command: "name", description: "Set or view my name" },
    { command: "timezone", description: "Set your timezone" },
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

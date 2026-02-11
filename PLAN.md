# Living Diary — Implementation Plan

A personal AI diary that lives in Telegram, remembers your life, and grows with you.

## Tech Stack

| Component       | Choice                     | Why                                              |
| --------------- | -------------------------- | ------------------------------------------------ |
| Language        | TypeScript                 | User preference, strong typing                   |
| Package Manager | pnpm                       | Fast, disk-efficient                             |
| Telegram Bot    | grammY                     | Modern, well-typed, actively maintained           |
| LLM Access      | Vercel AI SDK (`ai`)       | Unified interface for Claude, OpenAI, Ollama, etc |
| Default LLM     | Claude (Anthropic)         | Great for reflective, empathetic personality      |
| Vector DB       | LanceDB                   | Embedded, no server, native Node.js, file-backed |
| Embeddings      | Via AI SDK                 | Same multi-provider flexibility                   |
| Scheduler       | node-cron                  | Lightweight, for proactive check-ins              |
| Config          | dotenv + .env              | Simple environment variable management            |

## Architecture Overview

```
Telegram User
     |
     v
 grammY Bot  (receives messages)
     |
     v
 Context Builder  (assembles prompt)
     |
     ├── Short-term memory (in-memory sliding window of recent messages)
     ├── Long-term memory (LanceDB semantic search for relevant past entries)
     └── User facts (key facts the AI has learned about the user)
     |
     v
 AI SDK  (sends prompt to Claude / OpenAI / Ollama)
     |
     v
 Response Handler
     ├── Reply to user via Telegram
     └── Memory Extractor (extracts facts, creates diary entries, stores embeddings)
```

## Backlog

### Phase 1: Foundation

#### Task 1 — Initialize project and choose tech stack
- Initialize git repo, pnpm project, TypeScript config
- Install core dependencies: grammy, ai, @ai-sdk/anthropic, @lancedb/lancedb, dotenv, node-cron
- Set up project structure:
  ```
  src/
    index.ts          # Entry point
    bot/              # Telegram bot setup and handlers
    ai/               # LLM integration and prompt building
    memory/           # LanceDB storage, retrieval, extraction
    scheduler/        # Proactive check-ins and reflections
    config.ts         # Environment and configuration
  ```
- Add .gitignore, .env.example, tsconfig.json
- Add dev/build/start scripts

---

### Phase 2: Core (parallel tracks after Phase 1)

#### Task 2 — Set up Telegram bot scaffold
- **Depends on**: Task 1
- Register bot with @BotFather, obtain API token
- Set up grammY with polling (simpler than webhooks for personal use)
- Implement basic commands:
  - `/start` — Welcome message explaining what the diary does
  - `/help` — List available commands
- Verify the bot receives and replies to text messages
- Store bot token in `.env`

#### Task 3 — Design and implement the memory system (LanceDB)
- **Depends on**: Task 1
- Design LanceDB schema:
  ```
  diary_memories table:
    - id: string (uuid)
    - timestamp: number (unix ms)
    - content: string (the memory text)
    - type: "diary_entry" | "user_fact" | "conversation_summary" | "reflection"
    - tags: string[] (auto-generated topics)
    - mood: string | null (detected mood)
    - vector: float32[] (embedding)
  ```
- Implement memory service:
  - `addMemory(content, type, metadata)` — embed and store
  - `searchMemories(query, limit)` — semantic similarity search
  - `getRecentMemories(n)` — last N memories by timestamp
  - `deleteMemory(id)` — remove a specific memory
  - `exportAll()` — dump all memories as JSON
- Implement embedding generation via AI SDK
- Short-term context: in-memory ring buffer of last ~20 conversation turns

---

### Phase 3: The Brain

#### Task 4 — Integrate LLM for conversational diary interactions
- **Depends on**: Task 2, Task 3
- Design the system prompt:
  - Persona: empathetic, reflective, curious diary companion
  - Instructions: ask follow-up questions, notice patterns, validate emotions
  - Boundaries: no advice-giving unless asked, no external actions
- Build the context assembly pipeline:
  1. Take user's message
  2. Search LanceDB for relevant past memories (top 5-10)
  3. Include recent conversation turns (short-term memory)
  4. Include known user facts
  5. Assemble system prompt + context + user message
  6. Send to LLM via AI SDK
  7. Return response to user
- Handle token limits (truncate/summarize if context too large)
- Support streaming responses for better UX

#### Task 5 — Implement memory extraction and recall pipeline
- **Depends on**: Task 3, Task 4
- After each AI response, run extraction:
  - Use the LLM to extract: key facts, events, emotions, preferences
  - Decide if the conversation warrants a diary entry
  - Store extracted memories in LanceDB with embeddings
- Memory consolidation:
  - Periodically summarize clusters of related memories
  - Replace granular entries with consolidated summaries when they age
- Deduplication: avoid storing the same fact multiple times

---

### Phase 4: Polish (parallel tracks)

#### Task 6 — Add proactive check-in and reflection features
- **Depends on**: Task 4, Task 5
- Daily check-in: configurable time, sends a message asking how the day is going
- Weekly reflection: summarize the week's entries, notice themes and mood trends
- Gentle nudge: if no journaling in N days, send a friendly reminder
- Date-aware prompts: remember mentioned events and ask about them
- Use node-cron for scheduling
- Respect user timezone (configurable) and quiet hours
- `/pause` and `/resume` commands to control proactive messages

#### Task 7 — Build deployment and process management
- **Depends on**: Task 4
- Create Dockerfile (multi-stage build for small image)
- Create docker-compose.yml (just the app — LanceDB is embedded, no DB container)
- Add health check endpoint or heartbeat logging
- Graceful shutdown handling (SIGTERM/SIGINT)
- Structured logging (pino or winston)
- Auto-restart on crash (Docker restart policy)
- Document deployment options: VPS, Fly.io, Railway

#### Task 8 — Add safety guardrails and user controls
- **Depends on**: Task 4
- Single-user mode: lock bot to one Telegram user ID (from .env)
- No external actions: the bot only reads/writes its own memory store
- User commands:
  - `/forget <query>` — find and delete matching memories
  - `/export` — download all data as JSON
  - `/pause` / `/resume` — control proactive messages
  - `/delete_all` — delete all memories (with confirmation)
  - `/stats` — show memory count, first entry date, etc.
- Rate limiting: cap LLM API calls per hour
- Content boundaries enforced in system prompt

#### Task 9 — Rich diary features (mood tracking, tags, search)
- **Depends on**: Task 5
- Mood tracking: auto-detect mood from conversations, store per entry
- Auto-tagging: categorize entries (work, health, relationships, hobbies, etc.)
- `/search <query>` — semantic search across all memories
- `/timeline [days]` — summary of recent entries
- `/mood [days]` — mood trend over time (text-based visualization)
- `/onthisday` — entries from this date in previous months/years

#### Task 10 — Write tests and documentation
- **Depends on**: Task 5
- Unit tests: memory CRUD, embedding, search, fact extraction, prompt assembly
- Integration tests: mock Telegram + mock LLM, end-to-end message flow
- README.md: project overview, setup guide, architecture diagram
- CLAUDE.md: conventions for AI-assisted development on this project
- .env.example: all required/optional variables documented

---

## Dependency Graph

```
#1 Project Init
├── #2 Telegram Bot ──┐
└── #3 Memory System ─┼── #4 LLM Integration ─┬── #5 Memory Pipeline ─┬── #6 Proactive Features
                      │                        ├── #7 Deployment       ├── #9 Rich Features
                      │                        └── #8 Safety          └── #10 Tests & Docs
                      └────────────────────────────┘
```

## Getting Started (for the human)

1. Create a Telegram bot via @BotFather and save the token
2. Get a Claude API key from console.anthropic.com
3. Copy `.env.example` to `.env` and fill in the values
4. `pnpm install && pnpm dev`

# Living Diary

An AI-powered memory companion that lives in Telegram. Talk to it about your day, the people in your life, or anything on your mind -- it remembers what matters and reflects it back naturally over time.

## What it does

- **Remembers conversations** -- extracts facts, diary entries, and details about people from your messages
- **Recalls naturally** -- uses vector search and tool calling to reference past conversations when relevant
- **Knows your people** -- builds a structured graph of people and relationships as you mention them
- **Understands photos** -- describe and store photos via Claude vision
- **Web dashboard** -- browse memories, search, view your people graph (with D3 force-directed visualization), manage persona settings

## Setup

Requires Node.js 20+ and [pnpm](https://pnpm.io/).

```bash
pnpm install
cd web && pnpm install && cd ..
cp .env.example .env
```

Fill in your `.env`:

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | From [@BotFather](https://t.me/BotFather) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `OPENAI_API_KEY` | Yes | For embeddings (text-embedding-3-small) |
| `ALLOWED_USER_IDS` | Yes | Comma-separated Telegram user IDs |
| `AI_MODEL` | No | Defaults to `claude-sonnet-4-5-20250929` |
| `DASHBOARD_TOKEN` | No | Protects the web dashboard |

## Running

```bash
# Development (hot reload)
pnpm dev          # Bot + API server
pnpm dev:web      # React dashboard (separate terminal)

# Production
pnpm build
pnpm start        # Serves both bot and dashboard
```

The dashboard runs on `http://localhost:3000` by default.

## Bot commands

| Command | Description |
|---|---|
| `/search <query>` | Search your memories |
| `/forget <query>` | Delete matching memories |
| `/export` | Download all data as JSON |
| `/stats` | Memory statistics |
| `/configure <desc>` | Change the bot's persona |
| `/persona` | Show current persona |
| `/delete_all` | Delete everything |

Or just send a message and chat.

## Tech stack

TypeScript, [grammY](https://grammy.dev/), [Vercel AI SDK](https://sdk.vercel.ai/), Claude (conversation + extraction), OpenAI (embeddings), [LanceDB](https://lancedb.com/) (vector storage), React + Vite (dashboard), D3 (people graph).

## Data storage

All data lives in `data/` (git-ignored):

- **LanceDB** -- vector-indexed memories (diary entries, user facts, photos)
- **people.json** -- structured people and relationships graph
- **persona.json** -- custom bot persona configuration

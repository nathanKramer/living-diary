# Living Diary

<img src="assets/living-diary.png" width="200" alt="Living Diary" >

An AI-powered memory companion that lives in Telegram. Talk to it about your day, the people in your life, or anything on your mind -- it remembers what matters and reflects it back naturally over time.

This is the local version. The new version (livingdiary.ai) is elixir/phoenix.

## What it does

- **Remembers conversations** -- extracts facts, diary entries, and details about people from your messages
- **Recalls naturally** -- uses vector search and tool calling to reference past conversations when relevant
- **Knows your people** -- builds a structured graph of people and relationships as you mention them
- **Understands photos** -- describe and store photos via Claude vision, automatically tag people mentioned in captions
- **Stores videos** -- save video messages with captions and people tags
- **Web dashboard** -- browse, edit, and search memories, view your people graph (with D3 force-directed visualization), manage persona settings

## Setup

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/)
- A Telegram account
- API keys for [Anthropic](https://console.anthropic.com/) (Claude) and [OpenAI](https://platform.openai.com/) (embeddings)

### 1. Create a Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts to choose a name and username
3. BotFather will give you a **bot token** -- save this for your `.env`
4. Optionally, send `/setdescription` to set what users see when they first open your bot
5. Optionally, send `/setuserpic` to give your bot a profile photo

### 2. Get your Telegram user ID

The bot needs your user ID to send you approval requests when new users message it.

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It will reply with your user ID (a number like `123456789`)

### 3. Install and configure

```bash
pnpm install
cd web && pnpm install && cd ..
cp .env.example .env
```

Fill in your `.env`:

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from BotFather (step 1) |
| `ANTHROPIC_API_KEY` | Yes | From [Anthropic Console](https://console.anthropic.com/) |
| `OPENAI_API_KEY` | Yes | From [OpenAI Platform](https://platform.openai.com/) -- used for embeddings only (text-embedding-3-small) |
| `ADMIN_TELEGRAM_ID` | Yes | Your Telegram user ID (step 2) -- receives approval requests for new users |
| `ALLOWED_USER_IDS` | No | Comma-separated user IDs to pre-approve on first startup |
| `AI_MODEL` | No | Defaults to `claude-sonnet-4-5-20250929` |
| `DASHBOARD_TOKEN` | No | Set a password to protect the web dashboard |

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

- **LanceDB** -- vector-indexed memories (diary entries, user facts, photos, videos)
- **people.json** -- structured people and relationships graph
- **persona.json** -- custom bot persona configuration
- **allowlist.json** -- approved user IDs and pending approval requests

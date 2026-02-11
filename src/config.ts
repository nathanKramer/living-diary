import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
  openaiApiKey: requireEnv("OPENAI_API_KEY"),
  allowedUserId: Number(requireEnv("ALLOWED_USER_ID")),
  aiModel: process.env["AI_MODEL"] ?? "claude-sonnet-4-5-20250929",
  dataDir: process.env["DATA_DIR"] ?? "./data",
  timezone: process.env["TIMEZONE"] ?? "UTC",
} as const;

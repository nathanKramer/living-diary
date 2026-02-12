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
  adminTelegramId: Number(requireEnv("ADMIN_TELEGRAM_ID")),
  allowedUserIds: (process.env["ALLOWED_USER_IDS"] ?? "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => !isNaN(id) && id > 0),
  aiModel: process.env["AI_MODEL"] ?? "claude-sonnet-4-5-20250929",
  dataDir: process.env["DATA_DIR"] ?? "./data",
  timezone: process.env["TIMEZONE"] ?? "UTC",
  dashboardPort: Number(process.env["DASHBOARD_PORT"] ?? "3000"),
  dashboardToken: requireEnv("DASHBOARD_TOKEN"),
} as const;

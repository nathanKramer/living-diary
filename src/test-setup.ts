// Set dummy env vars so config.ts can load without throwing.
// These values are never used by unit tests — they only
// prevent requireEnv() from crashing on import.
process.env["TELEGRAM_BOT_TOKEN"] = "test-token";
process.env["ANTHROPIC_API_KEY"] = "test-key";
process.env["OPENAI_API_KEY"] = "test-key";
process.env["ADMIN_TELEGRAM_ID"] = "99999";
process.env["DASHBOARD_TOKEN"] = "test-dashboard-token";
process.env["DATA_DIR"] = "/tmp/living-diary-test";

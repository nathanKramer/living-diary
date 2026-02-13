import { appendFile, readFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";

const CHAT_LOGS_DIR = join("data", "chat-logs");

interface LogEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function appendLog(userId: number, role: "user" | "assistant", content: string): void {
  const entry: LogEntry = { role, content, timestamp: Date.now() };
  const line = JSON.stringify(entry) + "\n";
  const filePath = join(CHAT_LOGS_DIR, `${userId}.jsonl`);

  mkdir(CHAT_LOGS_DIR, { recursive: true })
    .then(() => appendFile(filePath, line, "utf-8"))
    .catch((err) => console.error(`Failed to append chat log for user ${userId}:`, err));
}

export async function readRecentLogs(
  userId: number,
  limit: number,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const filePath = join(CHAT_LOGS_DIR, `${userId}.jsonl`);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = raw.trim().split("\n").filter(Boolean);
  const entries: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as LogEntry;
      entries.push({ role: parsed.role, content: parsed.content });
    } catch {
      // Skip malformed lines
    }
  }

  return entries.slice(-limit);
}

export async function listChatLogUserIds(): Promise<number[]> {
  let files: string[];
  try {
    files = await readdir(CHAT_LOGS_DIR);
  } catch {
    return [];
  }

  const userIds: number[] = [];
  for (const file of files) {
    if (file.endsWith(".jsonl")) {
      const id = Number(file.replace(".jsonl", ""));
      if (!isNaN(id)) userIds.push(id);
    }
  }
  return userIds;
}

export async function readLogs(
  userId: number,
  limit: number,
): Promise<Array<{ role: "user" | "assistant"; content: string; timestamp: number }>> {
  const filePath = join(CHAT_LOGS_DIR, `${userId}.jsonl`);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = raw.trim().split("\n").filter(Boolean);
  const entries: Array<{ role: "user" | "assistant"; content: string; timestamp: number }> = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as LogEntry;
      entries.push({ role: parsed.role, content: parsed.content, timestamp: parsed.timestamp });
    } catch {
      // Skip malformed lines
    }
  }

  return entries.slice(-limit);
}

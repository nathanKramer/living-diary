import { appendFile, readFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";

const CHAT_LOGS_DIR = join("data", "chat-logs");

interface LogEntry {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}

export function appendLog(
  userId: number,
  role: "user" | "assistant" | "tool",
  content: string,
  toolName?: string,
  toolArgs?: Record<string, unknown>,
): void {
  const entry: LogEntry = { role, content, timestamp: Date.now() };
  if (toolName) entry.toolName = toolName;
  if (toolArgs) entry.toolArgs = toolArgs;
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
      // Only hydrate user/assistant messages into the session, not tool calls
      if (parsed.role === "user" || parsed.role === "assistant") {
        entries.push({ role: parsed.role, content: parsed.content });
      }
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

export interface ChatLogEntry {
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
}

export async function readLogs(
  userId: number,
  limit: number,
): Promise<ChatLogEntry[]> {
  const filePath = join(CHAT_LOGS_DIR, `${userId}.jsonl`);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = raw.trim().split("\n").filter(Boolean);
  const entries: ChatLogEntry[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as LogEntry;
      const entry: ChatLogEntry = { role: parsed.role, content: parsed.content, timestamp: parsed.timestamp };
      if (parsed.toolName) entry.toolName = parsed.toolName;
      if (parsed.toolArgs) entry.toolArgs = parsed.toolArgs;
      entries.push(entry);
    } catch {
      // Skip malformed lines
    }
  }

  return entries.slice(-limit);
}

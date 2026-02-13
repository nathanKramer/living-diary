import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";

type TimezoneMap = Record<string, string>;

function timezonesPath(): string {
  return join(config.dataDir, "timezones.json");
}

export async function loadTimezones(): Promise<TimezoneMap> {
  try {
    const raw = await readFile(timezonesPath(), "utf-8");
    return JSON.parse(raw) as TimezoneMap;
  } catch {
    return {};
  }
}

async function saveTimezones(data: TimezoneMap): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(timezonesPath(), JSON.stringify(data, null, 2), "utf-8");
}

export class TimezoneHolder {
  private data: TimezoneMap;

  constructor(initial: TimezoneMap) {
    this.data = initial;
  }

  get(userId: number): string | undefined {
    return this.data[String(userId)];
  }

  async set(userId: number, timezone: string): Promise<void> {
    this.data[String(userId)] = timezone;
    await saveTimezones(this.data);
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

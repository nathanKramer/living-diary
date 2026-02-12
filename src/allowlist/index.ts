import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";

export interface PendingRequest {
  userId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  requestedAt: number;
}

export interface AllowlistData {
  approvedUserIds: number[];
  pendingRequests: PendingRequest[];
}

function allowlistPath(): string {
  return join(config.dataDir, "allowlist.json");
}

function emptyAllowlist(): AllowlistData {
  return { approvedUserIds: [], pendingRequests: [] };
}

export async function loadAllowlist(): Promise<AllowlistData> {
  try {
    const raw = await readFile(allowlistPath(), "utf-8");
    const parsed = JSON.parse(raw) as AllowlistData;
    if (!Array.isArray(parsed.approvedUserIds) || !Array.isArray(parsed.pendingRequests)) {
      return emptyAllowlist();
    }
    return parsed;
  } catch {
    return emptyAllowlist();
  }
}

async function saveAllowlist(data: AllowlistData): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(allowlistPath(), JSON.stringify(data, null, 2), "utf-8");
}

export class AllowlistHolder {
  current: AllowlistData;

  constructor(initial: AllowlistData) {
    this.current = initial;
    // Admin is always pre-approved
    if (!this.current.approvedUserIds.includes(config.adminTelegramId)) {
      this.current.approvedUserIds.push(config.adminTelegramId);
    }
  }

  isApproved(userId: number): boolean {
    return this.current.approvedUserIds.includes(userId);
  }

  isPending(userId: number): boolean {
    return this.current.pendingRequests.some((r) => r.userId === userId);
  }

  addPendingRequest(info: Omit<PendingRequest, "requestedAt">): void {
    if (this.isPending(info.userId) || this.isApproved(info.userId)) return;
    this.current.pendingRequests.push({ ...info, requestedAt: Date.now() });
  }

  async approve(userId: number): Promise<void> {
    if (!this.current.approvedUserIds.includes(userId)) {
      this.current.approvedUserIds.push(userId);
    }

    const updated = this.current.pendingRequests.filter((r) => r.userId !== userId);
    this.current.pendingRequests = updated;
    await this.save();
  }

  async reject(userId: number): Promise<void> {
    const updated = this.current.pendingRequests.filter((r) => r.userId !== userId);
    this.current.pendingRequests = updated;
    await this.save();
  }

  seedFromEnv(userIds: number[]): void {
    for (const id of userIds) {
      if (!this.current.approvedUserIds.includes(id)) {
        this.current.approvedUserIds.push(id);
      }
    }
  }

  async save(): Promise<void> {
    await saveAllowlist(this.current);
  }
}

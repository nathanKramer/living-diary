import * as lancedb from "@lancedb/lancedb";
import * as arrow from "apache-arrow";
import { v4 as uuidv4 } from "uuid";
import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { config } from "../config.js";

export type { MemoryType, Memory, MemoryWithDistance } from "../shared/types.js";
import type { MemoryType, Memory, MemoryWithDistance } from "../shared/types.js";

const EMBEDDING_MODEL = "text-embedding-3-small";
const VECTOR_DIM = 1536;
const TABLE_NAME = "memories";

// Cosine distance thresholds for deduplication (lower = more similar)
const DEDUP_THRESHOLD_FACT = 0.10; // Aggressive — "I'm an engineer" ≈ "I work as a software engineer"
const DEDUP_THRESHOLD_ENTRY = 0.05; // Tighter — similar days are still worth recording

const tableSchema = new arrow.Schema([
  new arrow.Field("id", new arrow.Utf8(), false),
  new arrow.Field("userId", new arrow.Float64(), false),
  new arrow.Field("content", new arrow.Utf8(), false),
  new arrow.Field("type", new arrow.Utf8(), false),
  new arrow.Field("tags", new arrow.Utf8(), false),
  new arrow.Field("timestamp", new arrow.Float64(), false),
  new arrow.Field("photoFileId", new arrow.Utf8(), true),
  new arrow.Field("source", new arrow.Utf8(), true),
  new arrow.Field("subjectName", new arrow.Utf8(), true),
  new arrow.Field(
    "vector",
    new arrow.FixedSizeList(
      VECTOR_DIM,
      new arrow.Field("item", new arrow.Float32(), true),
    ),
    false,
  ),
]);

async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embeddingModel(EMBEDDING_MODEL),
    value: text,
  });
  return embedding;
}

export class MemoryStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  async init(): Promise<void> {
    this.db = await lancedb.connect(config.dataDir);

    const tableNames = await this.db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      const existing = await this.db.openTable(TABLE_NAME);
      // const schema = await existing.schema();
      this.table = existing;
    } else {
      this.table = await this.db.createEmptyTable(TABLE_NAME, tableSchema);
    }

    console.log(`Memory store initialized at ${config.dataDir}`);
    const count = await this.table.countRows();
    console.log(`Memories loaded: ${count}`);
  }

  async addMemory(
    content: string,
    type: MemoryType,
    userId: number,
    tags: string[] = [],
    options?: { photoFileId?: string; source?: string; subjectName?: string },
  ): Promise<string | null> {
    if (!this.table) throw new Error("Memory store not initialized");

    const vector = await generateEmbedding(content);

    // Dedup: check for near-duplicate memories before inserting
    const count = await this.table.countRows();
    if (count > 0) {
      const threshold = type === "user_fact"
        ? DEDUP_THRESHOLD_FACT
        : DEDUP_THRESHOLD_ENTRY;

      const conditions = [`type = '${type}'`];
      if (type === "user_fact") {
        conditions.push(`userId = ${userId}`);
      }

      const similar = await this.table
        .vectorSearch(vector)
        .distanceType("cosine")
        .where(conditions.join(" AND "))
        .limit(1)
        .toArray();

      if (similar.length > 0 && (similar[0]!._distance as number) < threshold) {
        console.log(
          `Skipped duplicate ${type} (distance=${(similar[0]!._distance as number).toFixed(4)}): "${content}"`,
        );
        return null;
      }
    }
    // End dedup check

    const id = uuidv4();

    await this.table.add([
      {
        id,
        userId,
        content,
        type,
        tags: tags.join(","),
        timestamp: Date.now(),
        photoFileId: options?.photoFileId ?? null,
        source: options?.source ?? null,
        subjectName: options?.subjectName ?? null,
        vector,
      },
    ]);

    return id;
  }

  async searchMemories(
    query: string,
    limit: number = 5,
    options: { typeFilter?: MemoryType; userIdFilter?: number } = {},
  ): Promise<MemoryWithDistance[]> {
    if (!this.table) throw new Error("Memory store not initialized");

    const queryVector = await generateEmbedding(query);

    const conditions: string[] = [];
    if (options.typeFilter) {
      conditions.push(`type = '${options.typeFilter}'`);
    }
    if (options.userIdFilter !== undefined) {
      conditions.push(`userId = ${options.userIdFilter}`);
    }

    let search = this.table
      .vectorSearch(queryVector)
      .distanceType("cosine")
      .limit(limit);

    if (conditions.length > 0) {
      search = search.where(conditions.join(" AND "));
    }

    const results = await search.toArray();

    return results.map((row) => ({
      id: row.id as string,
      userId: row.userId as number,
      content: row.content as string,
      type: row.type as MemoryType,
      tags: row.tags as string,
      timestamp: row.timestamp as number,
      photoFileId: (row.photoFileId as string) || undefined,
      source: (row.source as string) || undefined,
      subjectName: (row.subjectName as string) || undefined,
      _distance: row._distance as number,
    }));
  }

  async getRecentMemories(limit: number = 10): Promise<Memory[]> {
    if (!this.table) throw new Error("Memory store not initialized");

    const count = await this.table.countRows();
    if (count === 0) return [];

    // LanceDB has no native orderBy, so fetch all (excluding vector), sort, and slice
    const results = await this.table
      .query()
      .select(["id", "userId", "content", "type", "tags", "timestamp", "photoFileId", "source", "subjectName"])
      .toArray();

    results.sort(
      (a, b) => (b.timestamp as number) - (a.timestamp as number),
    );

    return results.slice(0, limit).map((row) => ({
      id: row.id as string,
      userId: row.userId as number,
      content: row.content as string,
      type: row.type as MemoryType,
      tags: row.tags as string,
      timestamp: row.timestamp as number,
      photoFileId: (row.photoFileId as string) || undefined,
      source: (row.source as string) || undefined,
      subjectName: (row.subjectName as string) || undefined,
    }));
  }

  async searchByDateRange(
    startMs: number,
    endMs: number,
    limit: number = 20,
  ): Promise<Memory[]> {
    if (!this.table) throw new Error("Memory store not initialized");

    const count = await this.table.countRows();
    if (count === 0) return [];

    const results = await this.table
      .query()
      .select(["id", "userId", "content", "type", "tags", "timestamp", "photoFileId", "source", "subjectName"])
      .where(`timestamp >= ${startMs} AND timestamp < ${endMs}`)
      .limit(limit)
      .toArray();

    results.sort(
      (a, b) => (a.timestamp as number) - (b.timestamp as number),
    );

    return results.map((row) => ({
      id: row.id as string,
      userId: row.userId as number,
      content: row.content as string,
      type: row.type as MemoryType,
      tags: row.tags as string,
      timestamp: row.timestamp as number,
      photoFileId: (row.photoFileId as string) || undefined,
      source: (row.source as string) || undefined,
      subjectName: (row.subjectName as string) || undefined,
    }));
  }

  async getUserFacts(userId: number): Promise<Memory[]> {
    if (!this.table) throw new Error("Memory store not initialized");

    const count = await this.table.countRows();
    if (count === 0) return [];

    const results = await this.table
      .query()
      .select(["id", "userId", "content", "type", "tags", "timestamp", "photoFileId", "source", "subjectName"])
      .where(`type = 'user_fact' AND userId = ${userId}`)
      .toArray();

    return results.map((row) => ({
      id: row.id as string,
      userId: row.userId as number,
      content: row.content as string,
      type: row.type as MemoryType,
      tags: row.tags as string,
      timestamp: row.timestamp as number,
      photoFileId: (row.photoFileId as string) || undefined,
      source: (row.source as string) || undefined,
      subjectName: (row.subjectName as string) || undefined,
    }));
  }

  async getMemoriesBySubject(names: string[]): Promise<Memory[]> {
    if (!this.table) throw new Error("Memory store not initialized");
    if (names.length === 0) return [];

    const count = await this.table.countRows();
    if (count === 0) return [];

    // Fetch all rows with a subjectName, then filter in JS to handle
    // comma-separated multi-person tags (e.g. "Oscar, Nathan")
    const results = await this.table
      .query()
      .select(["id", "userId", "content", "type", "tags", "timestamp", "photoFileId", "source", "subjectName"])
      .where("subjectName IS NOT NULL")
      .toArray();

    const namesLower = new Set(names.map((n) => n.toLowerCase()));
    const filtered = results.filter((row) => {
      const subjects = (row.subjectName as string).split(",").map((s) => s.trim().toLowerCase());
      return subjects.some((s) => namesLower.has(s));
    });

    filtered.sort(
      (a, b) => (b.timestamp as number) - (a.timestamp as number),
    );

    return filtered.map((row) => ({
      id: row.id as string,
      userId: row.userId as number,
      content: row.content as string,
      type: row.type as MemoryType,
      tags: row.tags as string,
      timestamp: row.timestamp as number,
      photoFileId: (row.photoFileId as string) || undefined,
      source: (row.source as string) || undefined,
      subjectName: (row.subjectName as string) || undefined,
    }));
  }

  async updateMemory(
    id: string,
    updates: { content?: string; type?: MemoryType; tags?: string; subjectName?: string | null },
  ): Promise<Memory | null> {
    if (!this.table) throw new Error("Memory store not initialized");

    // Fetch existing row (including vector)
    const rows = await this.table
      .query()
      .where(`id = '${id.replace(/'/g, "''")}'`)
      .toArray();

    if (rows.length === 0) return null;
    const row = rows[0]!;

    const newContent = updates.content ?? (row.content as string);
    const needsReEmbed = updates.content !== undefined && updates.content !== row.content;
    const vector = needsReEmbed ? await generateEmbedding(newContent) : Array.from(row.vector as Iterable<number>);

    const updated = {
      id: row.id as string,
      userId: row.userId as number,
      content: newContent,
      type: (updates.type ?? row.type) as MemoryType,
      tags: updates.tags ?? (row.tags as string),
      timestamp: row.timestamp as number,
      photoFileId: (row.photoFileId as string) || null,
      source: (row.source as string) || null,
      subjectName: updates.subjectName !== undefined
        ? (updates.subjectName || null)
        : ((row.subjectName as string) || null),
      vector,
    };

    await this.table.delete(`id = '${id.replace(/'/g, "''")}'`);
    await this.table.add([updated]);

    return {
      id: updated.id,
      userId: updated.userId,
      content: updated.content,
      type: updated.type,
      tags: updated.tags,
      timestamp: updated.timestamp,
      photoFileId: updated.photoFileId || undefined,
      source: updated.source || undefined,
      subjectName: updated.subjectName || undefined,
    };
  }

  async deleteMemory(id: string): Promise<void> {
    if (!this.table) throw new Error("Memory store not initialized");
    await this.table.delete(`id = '${id}'`);
  }

  async deleteAll(): Promise<void> {
    if (!this.table) throw new Error("Memory store not initialized");
    await this.table.delete("true");
  }

  async countMemories(): Promise<number> {
    if (!this.table) throw new Error("Memory store not initialized");
    return this.table.countRows();
  }

  async exportAll(): Promise<Memory[]> {
    if (!this.table) throw new Error("Memory store not initialized");

    const results = await this.table
      .query()
      .select(["id", "userId", "content", "type", "tags", "timestamp", "photoFileId", "source", "subjectName"])
      .toArray();

    return results.map((row) => ({
      id: row.id as string,
      userId: row.userId as number,
      content: row.content as string,
      type: row.type as MemoryType,
      tags: row.tags as string,
      timestamp: row.timestamp as number,
      photoFileId: (row.photoFileId as string) || undefined,
      source: (row.source as string) || undefined,
      subjectName: (row.subjectName as string) || undefined,
    }));
  }
}

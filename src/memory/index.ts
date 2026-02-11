import * as lancedb from "@lancedb/lancedb";
import * as arrow from "apache-arrow";
import { v4 as uuidv4 } from "uuid";
import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { config } from "../config.js";

export type MemoryType =
  | "diary_entry"
  | "user_fact"
  | "conversation_summary"
  | "reflection";

export interface Memory {
  id: string;
  userId: number;
  content: string;
  type: MemoryType;
  tags: string;
  timestamp: number;
}

export interface MemoryWithDistance extends Memory {
  _distance: number;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const VECTOR_DIM = 1536;
const TABLE_NAME = "memories";

const tableSchema = new arrow.Schema([
  new arrow.Field("id", new arrow.Utf8(), false),
  new arrow.Field("userId", new arrow.Float64(), false),
  new arrow.Field("content", new arrow.Utf8(), false),
  new arrow.Field("type", new arrow.Utf8(), false),
  new arrow.Field("tags", new arrow.Utf8(), false),
  new arrow.Field("timestamp", new arrow.Float64(), false),
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
      const schema = await existing.schema();
      const hasUserId = schema.fields.some((f) => f.name === "userId");

      if (!hasUserId) {
        console.log("Schema outdated (missing userId), recreating table...");
        await this.db.dropTable(TABLE_NAME);
        this.table = await this.db.createEmptyTable(TABLE_NAME, tableSchema);
      } else {
        this.table = existing;
      }
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
  ): Promise<string> {
    if (!this.table) throw new Error("Memory store not initialized");

    const id = uuidv4();
    const vector = await generateEmbedding(content);

    await this.table.add([
      {
        id,
        userId,
        content,
        type,
        tags: tags.join(","),
        timestamp: Date.now(),
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
      _distance: row._distance as number,
    }));
  }

  async getRecentMemories(limit: number = 10): Promise<Memory[]> {
    if (!this.table) throw new Error("Memory store not initialized");

    const count = await this.table.countRows();
    if (count === 0) return [];

    const results = await this.table
      .query()
      .select(["id", "userId", "content", "type", "tags", "timestamp"])
      .limit(limit)
      .toArray();

    // Sort by timestamp descending (most recent first)
    results.sort(
      (a, b) => (b.timestamp as number) - (a.timestamp as number),
    );

    return results.map((row) => ({
      id: row.id as string,
      userId: row.userId as number,
      content: row.content as string,
      type: row.type as MemoryType,
      tags: row.tags as string,
      timestamp: row.timestamp as number,
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
      .select(["id", "userId", "content", "type", "tags", "timestamp"])
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
    }));
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
      .select(["id", "userId", "content", "type", "tags", "timestamp"])
      .toArray();

    return results.map((row) => ({
      id: row.id as string,
      userId: row.userId as number,
      content: row.content as string,
      type: row.type as MemoryType,
      tags: row.tags as string,
      timestamp: row.timestamp as number,
    }));
  }
}

import { Router } from "express";
import type { MemoryStore, MemoryType } from "../../memory/index.js";

export function memoriesRouter(memory: MemoryStore): Router {
  const router = Router();

  // GET /api/memories — recent memories
  router.get("/", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const memories = await memory.getRecentMemories(limit);
      res.json({ memories });
    } catch (err) {
      console.error("API /memories error:", err);
      res.status(500).json({ error: "Failed to fetch memories" });
    }
  });

  // GET /api/memories/search — semantic search
  router.get("/search", async (req, res) => {
    try {
      const q = String(req.query.q || "");
      if (!q) {
        res.status(400).json({ error: "Missing ?q= parameter" });
        return;
      }
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      const typeFilter = req.query.type as MemoryType | undefined;
      const results = await memory.searchMemories(q, limit, {
        typeFilter: typeFilter || undefined,
      });
      res.json({ memories: results });
    } catch (err) {
      console.error("API /memories/search error:", err);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // GET /api/memories/by-subject — filter by subjectName
  router.get("/by-subject", async (req, res) => {
    try {
      const names = String(req.query.names || "");
      if (!names) {
        res.status(400).json({ error: "Missing ?names= parameter (comma-separated)" });
        return;
      }
      const nameList = names.split(",").map((n) => n.trim()).filter(Boolean);
      const results = await memory.getMemoriesBySubject(nameList);
      res.json({ memories: results });
    } catch (err) {
      console.error("API /memories/by-subject error:", err);
      res.status(500).json({ error: "Subject query failed" });
    }
  });

  // GET /api/memories/date-range — date range query
  router.get("/date-range", async (req, res) => {
    try {
      const start = Number(req.query.start);
      const end = Number(req.query.end);
      if (!start || !end) {
        res.status(400).json({ error: "Missing ?start= and ?end= (unix ms)" });
        return;
      }
      const limit = Math.min(Number(req.query.limit) || 20, 200);
      const results = await memory.searchByDateRange(start, end, limit);
      res.json({ memories: results });
    } catch (err) {
      console.error("API /memories/date-range error:", err);
      res.status(500).json({ error: "Date range query failed" });
    }
  });

  // GET /api/memories/stats — aggregate stats
  router.get("/stats", async (req, res) => {
    try {
      const count = await memory.countMemories();
      const all = await memory.exportAll();
      const byType: Record<string, number> = {};
      let oldest = Infinity;
      let newest = 0;
      for (const m of all) {
        byType[m.type] = (byType[m.type] ?? 0) + 1;
        if (m.timestamp < oldest) oldest = m.timestamp;
        if (m.timestamp > newest) newest = m.timestamp;
      }
      res.json({
        count,
        byType,
        oldest: oldest === Infinity ? null : oldest,
        newest: newest || null,
      });
    } catch (err) {
      console.error("API /memories/stats error:", err);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // DELETE /api/memories/:id — delete a single memory
  router.delete("/:id", async (req, res) => {
    try {
      await memory.deleteMemory(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("API DELETE /memories/:id error:", err);
      res.status(500).json({ error: "Failed to delete memory" });
    }
  });

  return router;
}

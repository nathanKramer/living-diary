import { Router } from "express";
import type { CoreMemoryHolder } from "../../core-memories/index.js";

export function coreMemoriesRouter(holder: CoreMemoryHolder): Router {
  const router = Router();

  // GET /api/core-memories — get current core memories
  router.get("/", (_req, res) => {
    res.json({ coreMemories: holder.current });
  });

  // PUT /api/core-memories/name — set or clear the name
  router.put("/name", async (req, res) => {
    const { name } = req.body as { name?: string | null };
    try {
      holder.setName(name?.trim() || null);
      await holder.save();
      res.json({ coreMemories: holder.current });
    } catch (err) {
      console.error("API PUT /core-memories/name error:", err);
      res.status(500).json({ error: "Failed to update name" });
    }
  });

  // POST /api/core-memories/entries — add an entry
  router.post("/entries", async (req, res) => {
    const { content } = req.body as { content?: string };
    if (!content || typeof content !== "string" || !content.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    try {
      const entry = holder.addEntry(content.trim());
      if (!entry) {
        res.status(400).json({ error: "Maximum number of core memories reached" });
        return;
      }
      await holder.save();
      res.json({ entry, coreMemories: holder.current });
    } catch (err) {
      console.error("API POST /core-memories/entries error:", err);
      res.status(500).json({ error: "Failed to add entry" });
    }
  });

  // DELETE /api/core-memories/entries/:id — remove an entry
  router.delete("/entries/:id", async (req, res) => {
    try {
      const removed = holder.removeEntry(req.params.id);
      if (!removed) {
        res.status(404).json({ error: "Entry not found" });
        return;
      }
      await holder.save();
      res.json({ ok: true, coreMemories: holder.current });
    } catch (err) {
      console.error("API DELETE /core-memories/entries error:", err);
      res.status(500).json({ error: "Failed to delete entry" });
    }
  });

  return router;
}

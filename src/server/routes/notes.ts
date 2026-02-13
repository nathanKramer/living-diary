import { Router } from "express";
import type { NotesHolder } from "../../notes/index.js";

export function notesRouter(holder: NotesHolder): Router {
  const router = Router();

  // GET /api/notes — list all notes
  router.get("/", (_req, res) => {
    res.json({ notes: holder.current.notes });
  });

  // POST /api/notes — create a note
  router.post("/", async (req, res) => {
    const { content } = req.body as { content?: string };
    if (!content || typeof content !== "string" || !content.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    try {
      const note = holder.addNote(content.trim());
      if (!note) {
        res.status(400).json({ error: "Maximum number of notes reached" });
        return;
      }
      await holder.save();
      res.json({ note, notes: holder.current.notes });
    } catch (err) {
      console.error("API POST /notes error:", err);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // DELETE /api/notes/:id — remove a note
  router.delete("/:id", async (req, res) => {
    try {
      const removed = holder.removeNote(req.params.id);
      if (!removed) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      await holder.save();
      res.json({ ok: true, notes: holder.current.notes });
    } catch (err) {
      console.error("API DELETE /notes error:", err);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  return router;
}

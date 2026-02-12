import { Router } from "express";
import type { PeopleGraphHolder } from "../../people/index.js";
import type { RelationshipType } from "../../shared/types.js";

const VALID_RELATIONSHIP_TYPES = new Set<RelationshipType>([
  "sibling", "parent", "child", "partner", "friend", "coworker", "pet", "other",
]);

export function peopleRouter(holder: PeopleGraphHolder): Router {
  const router = Router();

  // GET /api/people — full graph
  router.get("/", (_req, res) => {
    res.json(holder.current);
  });

  // PUT /api/people/:id — update a person
  router.put("/:id", async (req, res) => {
    const { name, aliases, bio, telegramUserId } = req.body as {
      name?: string;
      aliases?: string[];
      bio?: string;
      telegramUserId?: number | null;
    };

    const person = holder.updatePerson(req.params.id, { name, aliases, bio, telegramUserId });
    if (!person) {
      res.status(404).json({ error: "Person not found" });
      return;
    }

    try {
      await holder.save();
      res.json({ person });
    } catch (err) {
      console.error("API PUT /people/:id error:", err);
      res.status(500).json({ error: "Failed to save" });
    }
  });

  // POST /api/people/:id/merge — merge another person into this one
  router.post("/:id/merge", async (req, res) => {
    const { mergeId } = req.body as { mergeId?: string };
    if (!mergeId || typeof mergeId !== "string") {
      res.status(400).json({ error: "mergeId is required" });
      return;
    }

    const result = holder.mergePeople(req.params.id, mergeId);
    if (!result) {
      res.status(404).json({ error: "One or both people not found" });
      return;
    }

    try {
      await holder.save();
      res.json({ person: result });
    } catch (err) {
      console.error("API POST /people/:id/merge error:", err);
      res.status(500).json({ error: "Failed to save" });
    }
  });

  // DELETE /api/people/:id — remove a person
  router.delete("/:id", async (req, res) => {
    const deleted = holder.deletePerson(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Person not found" });
      return;
    }

    try {
      await holder.save();
      res.json({ ok: true });
    } catch (err) {
      console.error("API DELETE /people/:id error:", err);
      res.status(500).json({ error: "Failed to save" });
    }
  });

  // POST /api/relationships — add a relationship
  router.post("/relationships", async (req, res) => {
    const { personId1, personId2, type, label } = req.body as {
      personId1?: string;
      personId2?: string;
      type?: RelationshipType;
      label?: string;
    };

    if (!personId1 || !personId2 || !type || !label) {
      res.status(400).json({ error: "personId1, personId2, type, and label are required" });
      return;
    }

    if (!VALID_RELATIONSHIP_TYPES.has(type)) {
      res.status(400).json({ error: `Invalid relationship type: ${type}` });
      return;
    }

    const rel = holder.addRelationship(personId1, personId2, type, label);
    if (!rel) {
      res.status(400).json({ error: "Failed to add relationship (people not found or duplicate)" });
      return;
    }

    try {
      await holder.save();
      res.json({ relationship: rel });
    } catch (err) {
      console.error("API POST /relationships error:", err);
      res.status(500).json({ error: "Failed to save" });
    }
  });

  // DELETE /api/relationships/:id — remove a relationship
  router.delete("/relationships/:id", async (req, res) => {
    const deleted = holder.deleteRelationship(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Relationship not found" });
      return;
    }

    try {
      await holder.save();
      res.json({ ok: true });
    } catch (err) {
      console.error("API DELETE /relationships/:id error:", err);
      res.status(500).json({ error: "Failed to save" });
    }
  });

  return router;
}

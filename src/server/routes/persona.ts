import { Router } from "express";
import { generatePersona } from "../../ai/configure.js";
import { savePersona, deletePersona } from "../../persona/index.js";
import type { PersonaHolder } from "../../persona/index.js";

export function personaRouter(holder: PersonaHolder): Router {
  const router = Router();

  // GET /api/persona — get current persona
  router.get("/", (_req, res) => {
    res.json({ persona: holder.current });
  });

  // PUT /api/persona — generate and save a new persona
  router.put("/", async (req, res) => {
    const { description } = req.body as { description?: string };
    if (!description || typeof description !== "string" || !description.trim()) {
      res.status(400).json({ error: "description is required" });
      return;
    }

    try {
      const systemPromptAddition = await generatePersona(description.trim());
      const persona = {
        description: description.trim(),
        systemPromptAddition,
        updatedAt: Date.now(),
      };
      await savePersona(persona);
      holder.current = persona;
      res.json({ persona });
    } catch (err) {
      console.error("API PUT /persona error:", err);
      res.status(500).json({ error: "Failed to generate persona" });
    }
  });

  // PATCH /api/persona — save edited persona directly (no AI generation)
  router.patch("/", async (req, res) => {
    const { description, systemPromptAddition } = req.body as {
      description?: string;
      systemPromptAddition?: string;
    };

    if (!systemPromptAddition || typeof systemPromptAddition !== "string" || !systemPromptAddition.trim()) {
      res.status(400).json({ error: "systemPromptAddition is required" });
      return;
    }

    try {
      const persona = {
        description: description?.trim() || holder.current?.description || "Custom persona",
        systemPromptAddition: systemPromptAddition.trim(),
        updatedAt: Date.now(),
      };
      await savePersona(persona);
      holder.current = persona;
      res.json({ persona });
    } catch (err) {
      console.error("API PATCH /persona error:", err);
      res.status(500).json({ error: "Failed to save persona" });
    }
  });

  // DELETE /api/persona — reset to default
  router.delete("/", async (_req, res) => {
    try {
      await deletePersona();
      holder.current = null;
      res.json({ ok: true });
    } catch (err) {
      console.error("API DELETE /persona error:", err);
      res.status(500).json({ error: "Failed to reset persona" });
    }
  });

  return router;
}

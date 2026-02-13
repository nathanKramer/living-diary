import { Router } from "express";
import { listChatLogUserIds, readLogs } from "../../chat-logs/index.js";
import type { PeopleGraphHolder } from "../../people/index.js";

export function chatLogsRouter(peopleHolder: PeopleGraphHolder): Router {
  const router = Router();

  // GET /api/chat-logs — list users with chat logs
  router.get("/", async (_req, res) => {
    try {
      const userIds = await listChatLogUserIds();
      const users = userIds.map((userId) => {
        const person = peopleHolder.current.people.find(
          (p) => p.telegramUserId === userId,
        );
        return { userId, name: person?.name ?? null };
      });
      res.json({ users });
    } catch (err) {
      console.error("API GET /chat-logs error:", err);
      res.status(500).json({ error: "Failed to list chat logs" });
    }
  });

  // GET /api/chat-logs/:userId — get messages for a user
  router.get("/:userId", async (req, res) => {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      res.status(400).json({ error: "Invalid userId" });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 200, 1000);

    try {
      const messages = await readLogs(userId, limit);
      res.json({ messages });
    } catch (err) {
      console.error(`API GET /chat-logs/${userId} error:`, err);
      res.status(500).json({ error: "Failed to read chat logs" });
    }
  });

  return router;
}

import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { config } from "../config.js";
import { authMiddleware } from "./middleware/auth.js";
import { memoriesRouter } from "./routes/memories.js";
import { personaRouter } from "./routes/persona.js";
import { peopleRouter } from "./routes/people.js";
import type { MemoryStore } from "../memory/index.js";
import type { PersonaHolder } from "../persona/index.js";
import type { PeopleGraphHolder } from "../people/index.js";

export function startServer(memory: MemoryStore, personaHolder: PersonaHolder, peopleHolder: PeopleGraphHolder): void {
  const app = express();

  // API routes (auth-protected)
  app.use("/api", authMiddleware);
  app.use("/api", express.json());
  app.use("/api/memories", memoriesRouter(memory));
  app.use("/api/persona", personaRouter(personaHolder));
  app.use("/api/people", peopleRouter(peopleHolder));

  // Media proxy — streams photos/videos from Telegram on-demand
  app.get("/api/media/:fileId", async (req, res) => {
    try {
      const { fileId } = req.params;

      // Get file path from Telegram
      const fileRes = await fetch(
        `https://api.telegram.org/bot${config.telegramBotToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
      );
      const fileData = (await fileRes.json()) as { ok: boolean; result?: { file_path: string } };
      if (!fileData.ok || !fileData.result?.file_path) {
        res.status(404).json({ error: "File not found on Telegram" });
        return;
      }

      // Fetch and stream the file
      const mediaRes = await fetch(
        `https://api.telegram.org/file/bot${config.telegramBotToken}/${fileData.result.file_path}`,
      );
      if (!mediaRes.ok || !mediaRes.body) {
        res.status(502).json({ error: "Failed to fetch file from Telegram" });
        return;
      }

      const contentType = mediaRes.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");

      // Pipe the readable stream to the response
      const reader = mediaRes.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      await pump();
    } catch (err) {
      console.error("Media proxy error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Media proxy failed" });
      }
    }
  });

  // Serve built React app in production
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const webDist = join(__dirname, "../../web/dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*path", (_req, res) => {
      res.sendFile(join(webDist, "index.html"));
    });
  }

  app.listen(config.dashboardPort, () => {
    console.log(`Dashboard: http://localhost:${config.dashboardPort}`);
  });
}

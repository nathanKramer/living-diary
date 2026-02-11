import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { config } from "../config.js";
import { authMiddleware } from "./middleware/auth.js";
import { memoriesRouter } from "./routes/memories.js";
import type { MemoryStore } from "../memory/index.js";

export function startServer(memory: MemoryStore): void {
  const app = express();

  // API routes (auth-protected)
  app.use("/api", authMiddleware);
  app.use("/api/memories", memoriesRouter(memory));

  // Serve built React app in production
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const webDist = join(__dirname, "../../web/dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (_req, res) => {
      res.sendFile(join(webDist, "index.html"));
    });
  }

  app.listen(config.dashboardPort, () => {
    console.log(`Dashboard: http://localhost:${config.dashboardPort}`);
  });
}

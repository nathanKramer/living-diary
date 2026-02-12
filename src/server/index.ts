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

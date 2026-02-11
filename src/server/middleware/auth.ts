import type { Request, Response, NextFunction } from "express";
import { config } from "../../config.js";

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.dashboardToken) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || header !== `Bearer ${config.dashboardToken}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

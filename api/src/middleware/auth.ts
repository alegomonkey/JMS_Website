import type { NextFunction, Request, Response } from "express";
import type { DB } from "../db.js";
import { findUser } from "../services/userService.js";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: "authentication required" });
    return;
  }
  next();
}

// requireAdmin re-reads the role from the DB so role changes (via the
// promote/demote script) take effect on the next request, not the next login.
export function requireAdmin(db: DB) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = req.session.userId;
    if (!id) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const user = findUser(db, id);
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "admin only" });
      return;
    }
    next();
  };
}

export type OauthProvider = "github" | "google";

export type OauthIntent = "signin" | "link";

export interface PendingOauth {
  provider: OauthProvider;
  providerUserId: string;
  suggestedUsername: string;
}

declare module "express-session" {
  interface SessionData {
    userId?: number;
    username?: string;
    csrfToken?: string;
    oauthState?: string;
    oauthIntent?: OauthIntent;
    pendingOauth?: PendingOauth;
    slotToken?: string;
  }
}

import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/rateLimit.js";
import { httpError } from "../middleware/errorHandler.js";
import {
  bestDailyForUser,
  bestTimesForUser,
  recentGamesForUser,
  type RoundCount,
} from "../services/cribbageService.js";

const usernameParamSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_-]+$/);

const roundCountSchema = z.union([z.literal(5), z.literal(20), z.literal(100)]);

const gamesQuerySchema = z
  .object({
    round_count: z.coerce.number().pipe(roundCountSchema).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    // string, not z.coerce.boolean() — the latter maps "false" → true.
    completed: z.enum(["true", "1", "false", "0"]).optional(),
  })
  .strict();

const bioSchema = z.object({ bio: z.string().max(500) }).strict();

interface UserRow {
  id: number;
  username: string;
  role: "user" | "admin";
  bio: string;
  created_at: number;
}

export function usersRouter(db: DB): Router {
  const r = Router();

  r.get("/users/:username", (req, res, next) => {
    try {
      const username = usernameParamSchema.parse(req.params.username);
      const row = db
        .prepare("SELECT id, username, role, bio, created_at FROM users WHERE username = ?")
        .get(username) as UserRow | undefined;
      if (!row) {
        next(httpError(404, "user not found"));
        return;
      }
      res.json({
        user: {
          id: row.id,
          username: row.username,
          role: row.role,
          bio: row.bio,
          created_at: row.created_at,
        },
        bestTimes: bestTimesForUser(db, row.id),
        bestDaily: bestDailyForUser(db, row.id),
      });
    } catch (err) {
      next(err);
    }
  });

  r.get("/users/:username/games", (req, res, next) => {
    try {
      const username = usernameParamSchema.parse(req.params.username);
      const query = gamesQuerySchema.parse(req.query);
      const row = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(username) as { id: number } | undefined;
      if (!row) {
        next(httpError(404, "user not found"));
        return;
      }
      const games = recentGamesForUser(db, row.id, {
        limit: query.limit ?? 20,
        roundCount: query.round_count as RoundCount | undefined,
        completedOnly: query.completed === "true" || query.completed === "1",
      });
      res.json({ games });
    } catch (err) {
      next(err);
    }
  });

  r.patch("/users/me/bio", requireAuth, writeLimiter, (req, res, next) => {
    try {
      const { bio } = bioSchema.parse(req.body);
      const userId = req.session.userId as number;
      db.prepare("UPDATE users SET bio = ? WHERE id = ?").run(bio, userId);
      res.json({ bio });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/rateLimit.js";
import { httpError } from "../middleware/errorHandler.js";
import { findUser } from "../services/userService.js";

const usernameParamSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_-]+$/);

const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();

const idSchema = z.coerce.number().int().positive();

interface CommentRow {
  id: number;
  body: string;
  username: string;
  author_user_id: number;
  created_at: number;
}

export function profileCommentsRouter(db: DB): Router {
  const r = Router({ mergeParams: true });

  r.get("/users/:username/comments", (req, res, next) => {
    try {
      const username = usernameParamSchema.parse(req.params.username);
      const profile = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(username) as { id: number } | undefined;
      if (!profile) {
        next(httpError(404, "user not found"));
        return;
      }
      const rows = db
        .prepare(
          `SELECT pc.id, pc.body, u.username, pc.author_user_id, pc.created_at
           FROM profile_comments pc JOIN users u ON u.id = pc.author_user_id
           WHERE pc.profile_user_id = ?
           ORDER BY pc.created_at DESC, pc.id DESC
           LIMIT 500`,
        )
        .all(profile.id) as CommentRow[];
      res.json({ comments: rows });
    } catch (err) {
      next(err);
    }
  });

  r.post("/users/:username/comments", requireAuth, writeLimiter, (req, res, next) => {
    try {
      const username = usernameParamSchema.parse(req.params.username);
      const { body } = bodySchema.parse(req.body);
      const profile = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(username) as { id: number } | undefined;
      if (!profile) {
        next(httpError(404, "user not found"));
        return;
      }
      const authorId = req.session.userId as number;
      const info = db
        .prepare(
          "INSERT INTO profile_comments (profile_user_id, author_user_id, body) VALUES (?, ?, ?)",
        )
        .run(profile.id, authorId, body);
      const id = Number(info.lastInsertRowid);
      const row = db
        .prepare(
          `SELECT pc.id, pc.body, u.username, pc.author_user_id, pc.created_at
           FROM profile_comments pc JOIN users u ON u.id = pc.author_user_id
           WHERE pc.id = ?`,
        )
        .get(id) as CommentRow;
      res.status(201).json({ comment: row });
    } catch (err) {
      next(err);
    }
  });

  // Owner of the profile, or any admin, may delete a comment posted on that profile.
  r.delete("/users/:username/comments/:id", requireAuth, writeLimiter, (req, res, next) => {
    try {
      const username = usernameParamSchema.parse(req.params.username);
      const id = idSchema.parse(req.params.id);
      const profile = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(username) as { id: number } | undefined;
      if (!profile) {
        next(httpError(404, "user not found"));
        return;
      }
      const requesterId = req.session.userId as number;
      const requester = findUser(db, requesterId);
      const isOwner = profile.id === requesterId;
      const isAdmin = requester?.role === "admin";
      if (!isOwner && !isAdmin) {
        next(httpError(403, "only the profile owner or an admin may delete"));
        return;
      }
      const info = db
        .prepare("DELETE FROM profile_comments WHERE id = ? AND profile_user_id = ?")
        .run(id, profile.id);
      if (info.changes === 0) {
        next(httpError(404, "comment not found"));
        return;
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return r;
}

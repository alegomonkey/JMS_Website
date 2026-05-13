import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/rateLimit.js";
import {
  commentBodySchema,
  projectSlugSchema,
  sortQuerySchema,
} from "../schemas/index.js";
import {
  createComment,
  deleteComment,
  listComments,
} from "../services/commentService.js";
import { httpError } from "../middleware/errorHandler.js";

const idSchema = z.coerce.number().int().positive();

export function commentsRouter(db: DB): Router {
  const r = Router({ mergeParams: true });

  r.get("/projects/:slug/comments", (req, res, next) => {
    try {
      const slug = projectSlugSchema.parse(req.params.slug);
      const { sort } = sortQuerySchema.parse(req.query);
      const viewerId = req.session.userId ?? null;
      const rows = listComments(db, slug, sort, viewerId);
      res.json({ comments: rows });
    } catch (err) {
      next(err);
    }
  });

  r.post("/projects/:slug/comments", requireAuth, writeLimiter, (req, res, next) => {
    try {
      const slug = projectSlugSchema.parse(req.params.slug);
      const { body } = commentBodySchema.parse(req.body);
      const userId = req.session.userId as number;
      const created = createComment(db, slug, userId, body);
      res.status(201).json({ comment: created });
    } catch (err) {
      next(err);
    }
  });

  // Admin-only: delete any comment. There is no per-user delete by design —
  // moderation is centralized on the site owner.
  r.delete("/comments/:id", requireAdmin(db), writeLimiter, (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const removed = deleteComment(db, id);
      if (!removed) {
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

import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/rateLimit.js";
import { httpError } from "../middleware/errorHandler.js";
import { addVote, commentExists, removeVote } from "../services/voteService.js";

const idSchema = z.coerce.number().int().positive();

export function votesRouter(db: DB): Router {
  const r = Router();

  r.post("/comments/:id/vote", requireAuth, writeLimiter, (req, res, next) => {
    try {
      const commentId = idSchema.parse(req.params.id);
      if (!commentExists(db, commentId)) {
        next(httpError(404, "comment not found"));
        return;
      }
      const votes = addVote(db, commentId, req.session.userId as number);
      res.json({ votes });
    } catch (err) {
      next(err);
    }
  });

  r.delete("/comments/:id/vote", requireAuth, writeLimiter, (req, res, next) => {
    try {
      const commentId = idSchema.parse(req.params.id);
      if (!commentExists(db, commentId)) {
        next(httpError(404, "comment not found"));
        return;
      }
      const votes = removeVote(db, commentId, req.session.userId as number);
      res.json({ votes });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

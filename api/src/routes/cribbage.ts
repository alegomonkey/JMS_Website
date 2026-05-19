import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/rateLimit.js";
import { saveGame, leaderboard, type RoundCount } from "../services/cribbageService.js";

const SUIT = "(?:clubs|diamonds|hearts|spades)";
const RANK = "(?:[2-9]|10|A|J|Q|K)";
const CARD_RE = new RegExp(`^${SUIT}_${RANK}$`);
const cardSchema = z.string().regex(CARD_RE);

const handSchema = z
  .object({
    cards: z.array(cardSchema).length(4),
    cut: cardSchema,
    attempts: z.number().int().min(1).max(1000),
    time_ms: z.number().int().min(0).max(60 * 60 * 1000),
  })
  .strict()
  .refine((h) => new Set([...h.cards, h.cut]).size === 5, {
    message: "duplicate card within a hand",
  });

const roundCountSchema = z.union([z.literal(5), z.literal(20), z.literal(100)]);

const submitGameSchema = z
  .object({
    round_count: roundCountSchema,
    hands: z.array(handSchema).min(1).max(100),
  })
  .strict()
  .refine((b) => b.hands.length === b.round_count, {
    message: "hands.length must equal round_count",
  });

const leaderboardQuerySchema = z
  .object({
    rounds: z.coerce.number().pipe(roundCountSchema).optional(),
  })
  .strict();

export function cribbageRouter(db: DB): Router {
  const r = Router();

  r.post("/cribbage/games", requireAuth, writeLimiter, (req, res, next) => {
    try {
      const body = submitGameSchema.parse(req.body);
      const userId = req.session.userId as number;
      const result = saveGame(db, userId, body.round_count as RoundCount, body.hands);
      res.status(201).json({ game: result });
    } catch (err) {
      next(err);
    }
  });

  r.get("/cribbage/leaderboard", (req, res, next) => {
    try {
      const { rounds } = leaderboardQuerySchema.parse(req.query);
      const target = (rounds ?? 5) as RoundCount;
      const entries = leaderboard(db, target);
      res.json({ round_count: target, entries });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

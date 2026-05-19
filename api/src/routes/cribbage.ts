import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/rateLimit.js";
import { httpError } from "../middleware/errorHandler.js";
import {
  dailyLeaderboard,
  hasPlayedDaily,
  saveGame,
  type RoundCount,
} from "../services/cribbageService.js";
import { dailyHands, todayUtc } from "../services/cribbageDeck.js";

const SUIT = "(?:clubs|diamonds|hearts|spades)";
const RANK = "(?:[2-9]|10|A|J|Q|K)";
const CARD_RE = new RegExp(`^${SUIT}_${RANK}$`);
const cardSchema = z.string().regex(CARD_RE);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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
    daily_date: dateSchema.nullable().default(null),
    completed: z.boolean(),
  })
  .strict()
  .refine((b) => !b.completed || b.hands.length === b.round_count, {
    message: "completed=true requires hands.length === round_count",
  })
  .refine((b) => b.hands.length <= b.round_count, {
    message: "hands.length must not exceed round_count",
  });

const leaderboardQuerySchema = z
  .object({
    rounds: z.coerce.number().pipe(roundCountSchema).optional(),
  })
  .strict();

const dailyQuerySchema = z
  .object({
    rounds: z.coerce.number().pipe(roundCountSchema),
  })
  .strict();

export function cribbageRouter(db: DB): Router {
  const r = Router();

  r.post("/cribbage/games", requireAuth, writeLimiter, (req, res, next) => {
    try {
      const body = submitGameSchema.parse(req.body);
      const userId = req.session.userId as number;
      const roundCount = body.round_count as RoundCount;

      if (body.daily_date) {
        const today = todayUtc();
        if (body.daily_date !== today) {
          next(httpError(400, "daily_date must be today (UTC)"));
          return;
        }
        // Cheat check: dealt cards must match the server-derived sequence.
        const expected = dailyHands(today, roundCount);
        const handCount = body.hands.length;
        for (let i = 0; i < handCount; i++) {
          const e = expected[i]!;
          const got = body.hands[i]!;
          const eCards = [...e.cards].sort();
          const gCards = [...got.cards].sort();
          if (
            eCards.join(",") !== gCards.join(",") ||
            e.cut !== got.cut
          ) {
            next(httpError(400, "daily hands do not match the server's daily seed"));
            return;
          }
        }
      }

      const result = saveGame(db, userId, roundCount, body.hands, {
        dailyDate: body.daily_date,
        completed: body.completed,
      });
      res.status(201).json({ game: result });
    } catch (err) {
      next(err);
    }
  });

  // Public daily-leaderboard for today (UTC).
  r.get("/cribbage/daily/leaderboard", (req, res, next) => {
    try {
      const { rounds } = leaderboardQuerySchema.parse(req.query);
      const target = (rounds ?? 5) as RoundCount;
      const today = todayUtc();
      const entries = dailyLeaderboard(db, target, today);
      res.json({ round_count: target, date: today, entries });
    } catch (err) {
      next(err);
    }
  });

  // Today's daily hand sequence. Public; if authenticated, indicates whether
  // the requester has already submitted today's run at that length.
  r.get("/cribbage/daily", (req, res, next) => {
    try {
      const { rounds } = dailyQuerySchema.parse(req.query);
      const target = rounds as RoundCount;
      const today = todayUtc();
      const hands = dailyHands(today, target);
      const userId = req.session.userId;
      const played = userId ? hasPlayedDaily(db, userId, target, today) : false;
      res.json({ date: today, round_count: target, hands, played });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

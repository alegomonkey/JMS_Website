import type { DB } from "../db.js";
import { httpError } from "../middleware/errorHandler.js";
import { scoreHand } from "./cribbageScoring.js";

export type RoundCount = 5 | 20 | 100;

const MISTAKE_PENALTY_MS = 3000;

export interface IncomingHand {
  cards: string[];
  cut: string;
  attempts: number;
  time_ms: number;
}

interface StoredHand {
  cards: string[];
  cut: string;
  attempts: number;
  time_ms: number;
  correct: number;
}

export interface SaveResult {
  id: number;
  round_count: RoundCount;
  total_ms: number;
  mistakes: number;
  completed: boolean;
  daily_date: string | null;
  isPersonalBest: boolean;
  created_at: number;
}

export function saveGame(
  db: DB,
  userId: number,
  roundCount: RoundCount,
  hands: IncomingHand[],
  opts: { dailyDate: string | null; completed: boolean },
): SaveResult {
  // Server recomputes the correct score for each hand from the cards
  // (cheat-proof audit) but trusts client-reported attempts/time.
  const stored: StoredHand[] = hands.map((h) => ({
    cards: h.cards,
    cut: h.cut,
    attempts: h.attempts,
    time_ms: h.time_ms,
    correct: scoreHand(h.cards, h.cut).total,
  }));
  const rawTotalMs = stored.reduce((acc, h) => acc + h.time_ms, 0);
  const mistakes = stored.reduce((acc, h) => acc + Math.max(0, h.attempts - 1), 0);
  const totalMs = rawTotalMs + mistakes * MISTAKE_PENALTY_MS;
  const handsJson = JSON.stringify(stored);
  const createdAt = Math.floor(Date.now() / 1000);
  const completedInt = opts.completed ? 1 : 0;
  const dailyDate = opts.dailyDate;
  const isDailyInt = dailyDate ? 1 : 0;

  let isPersonalBest = false;

  const insertAndMaybeUpsertBest = db.transaction(() => {
    let id: number;
    try {
      const info = db
        .prepare(
          `INSERT INTO cribbage_games
            (user_id, round_count, total_ms, mistakes, hands_json, created_at, daily_date, completed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(userId, roundCount, totalMs, mistakes, handsJson, createdAt, dailyDate, completedInt);
      id = Number(info.lastInsertRowid);
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message) && dailyDate) {
        throw httpError(409, "you have already played today's daily for this length");
      }
      throw err;
    }

    if (opts.completed) {
      // Best-times only update on completed runs.
      const existing = db
        .prepare(
          "SELECT total_ms FROM cribbage_best_times WHERE user_id = ? AND round_count = ?",
        )
        .get(userId, roundCount) as { total_ms: number } | undefined;

      if (!existing || totalMs < existing.total_ms) {
        db.prepare(
          `INSERT INTO cribbage_best_times
             (user_id, round_count, game_id, total_ms, mistakes, created_at, is_daily)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, round_count) DO UPDATE SET
             game_id = excluded.game_id,
             total_ms = excluded.total_ms,
             mistakes = excluded.mistakes,
             created_at = excluded.created_at,
             is_daily = excluded.is_daily`,
        ).run(userId, roundCount, id, totalMs, mistakes, createdAt, isDailyInt);
        isPersonalBest = true;
      }
    }
    return id;
  });

  const id = insertAndMaybeUpsertBest();
  return {
    id,
    round_count: roundCount,
    total_ms: totalMs,
    mistakes,
    completed: opts.completed,
    daily_date: dailyDate,
    isPersonalBest,
    created_at: createdAt,
  };
}

export interface LeaderboardRow {
  rank: number;
  id: number;
  username: string;
  total_ms: number;
  mistakes: number;
  created_at: number;
  daily_date: string | null;
}

// Today's daily leaderboard for a given length. Only completed runs count.
export function dailyLeaderboard(
  db: DB,
  roundCount: RoundCount,
  dailyDate: string,
  limit = 20,
): LeaderboardRow[] {
  const rows = db
    .prepare(
      `SELECT g.id, u.username, g.total_ms, g.mistakes, g.created_at, g.daily_date
       FROM cribbage_games g JOIN users u ON u.id = g.user_id
       WHERE g.daily_date = ? AND g.round_count = ? AND g.completed = 1
       ORDER BY g.total_ms ASC, g.mistakes ASC, g.created_at ASC
       LIMIT ?`,
    )
    .all(dailyDate, roundCount, limit) as Array<Omit<LeaderboardRow, "rank">>;
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

// All-time leaderboard for a given length: fastest completed runs across all
// users, mixing daily and free-play. Uses idx_cribbage_games_lb.
export function allTimeLeaderboard(
  db: DB,
  roundCount: RoundCount,
  limit = 20,
): LeaderboardRow[] {
  const rows = db
    .prepare(
      `SELECT g.id, u.username, g.total_ms, g.mistakes, g.created_at, g.daily_date
       FROM cribbage_games g JOIN users u ON u.id = g.user_id
       WHERE g.round_count = ? AND g.completed = 1
       ORDER BY g.total_ms ASC, g.mistakes ASC, g.created_at ASC
       LIMIT ?`,
    )
    .all(roundCount, limit) as Array<Omit<LeaderboardRow, "rank">>;
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

export interface GameHand {
  cards: string[];
  cut: string;
  attempts: number;
  time_ms: number;
  correct: number;
}

export interface GameDetail {
  id: number;
  username: string;
  round_count: number;
  total_ms: number;
  mistakes: number;
  daily_date: string | null;
  completed: number;
  created_at: number;
  hands: GameHand[];
}

export function gameById(db: DB, id: number): GameDetail | null {
  const row = db
    .prepare(
      `SELECT g.id, u.username, g.round_count, g.total_ms, g.mistakes,
              g.daily_date, g.completed, g.created_at, g.hands_json
       FROM cribbage_games g JOIN users u ON u.id = g.user_id
       WHERE g.id = ?`,
    )
    .get(id) as
    | {
        id: number;
        username: string;
        round_count: number;
        total_ms: number;
        mistakes: number;
        daily_date: string | null;
        completed: number;
        created_at: number;
        hands_json: string;
      }
    | undefined;
  if (!row) return null;
  let hands: GameHand[] = [];
  try {
    hands = JSON.parse(row.hands_json) as GameHand[];
  } catch {
    hands = [];
  }
  return {
    id: row.id,
    username: row.username,
    round_count: row.round_count,
    total_ms: row.total_ms,
    mistakes: row.mistakes,
    daily_date: row.daily_date,
    completed: row.completed,
    created_at: row.created_at,
    hands,
  };
}

export interface BestEntry {
  game_id: number | null;
  total_ms: number;
  mistakes: number;
  created_at: number;
  is_daily?: boolean;
}

export interface BestTimes {
  "5": BestEntry | null;
  "20": BestEntry | null;
  "100": BestEntry | null;
}

export function bestTimesForUser(db: DB, userId: number): BestTimes {
  const rows = db
    .prepare(
      "SELECT round_count, game_id, total_ms, mistakes, created_at, is_daily FROM cribbage_best_times WHERE user_id = ?",
    )
    .all(userId) as Array<{
    round_count: number;
    game_id: number | null;
    total_ms: number;
    mistakes: number;
    created_at: number;
    is_daily: number;
  }>;
  const out: BestTimes = { "5": null, "20": null, "100": null };
  for (const r of rows) {
    const key = String(r.round_count) as "5" | "20" | "100";
    if (key in out) {
      out[key] = {
        game_id: r.game_id,
        total_ms: r.total_ms,
        mistakes: r.mistakes,
        created_at: r.created_at,
        is_daily: r.is_daily === 1,
      };
    }
  }
  return out;
}

export interface BestDailyEntry {
  game_id: number;
  total_ms: number;
  mistakes: number;
  daily_date: string;
}

export interface BestDaily {
  "5": BestDailyEntry | null;
  "20": BestDailyEntry | null;
  "100": BestDailyEntry | null;
}

export function bestDailyForUser(db: DB, userId: number): BestDaily {
  // For each round_count, the user's fastest completed daily run ever.
  // Window function ensures the returned mistakes/daily_date/id all come
  // from the same row as the MIN(total_ms) — using a bare GROUP BY here
  // returns an arbitrary row's siblings on SQLite.
  const rows = db
    .prepare(
      `SELECT id, round_count, total_ms, mistakes, daily_date FROM (
         SELECT id, round_count, total_ms, mistakes, daily_date,
           ROW_NUMBER() OVER (
             PARTITION BY round_count
             ORDER BY total_ms ASC, mistakes ASC, created_at ASC
           ) AS rn
         FROM cribbage_games
         WHERE user_id = ? AND daily_date IS NOT NULL AND completed = 1
       ) WHERE rn = 1`,
    )
    .all(userId) as Array<{
    id: number;
    round_count: number;
    total_ms: number;
    mistakes: number;
    daily_date: string;
  }>;
  const out: BestDaily = { "5": null, "20": null, "100": null };
  for (const r of rows) {
    const key = String(r.round_count) as "5" | "20" | "100";
    if (key in out) {
      out[key] = {
        game_id: r.id,
        total_ms: r.total_ms,
        mistakes: r.mistakes,
        daily_date: r.daily_date,
      };
    }
  }
  return out;
}

// Has this user already submitted a daily of this length today?
export function hasPlayedDaily(
  db: DB,
  userId: number,
  roundCount: RoundCount,
  dailyDate: string,
): boolean {
  const row = db
    .prepare(
      "SELECT 1 AS x FROM cribbage_games WHERE user_id = ? AND round_count = ? AND daily_date = ?",
    )
    .get(userId, roundCount, dailyDate);
  return !!row;
}

export interface RecentGame {
  id: number;
  round_count: number;
  total_ms: number;
  mistakes: number;
  hands_short: string;
  completed: number;
  daily_date: string | null;
  created_at: number;
}

const RANK_SHORT: Record<string, string> = {
  A: "A",
  "10": "10",
  J: "J",
  Q: "Q",
  K: "K",
};

function shortenCard(card: string): string {
  const idx = card.indexOf("_");
  const suit = card.slice(0, idx);
  const rank = card.slice(idx + 1);
  const r = RANK_SHORT[rank] ?? rank;
  return `${r}${suit[0]!.toUpperCase()}`;
}

function summarizeHands(handsJson: string): string {
  try {
    const arr = JSON.parse(handsJson) as Array<{ cards: string[]; cut: string }>;
    return arr
      .map((h) => `${h.cards.map(shortenCard).join(" ")} | ${shortenCard(h.cut)}`)
      .join("\n");
  } catch {
    return "";
  }
}

export interface RecentGamesOpts {
  limit?: number;
  roundCount?: RoundCount;
  completedOnly?: boolean;
}

export function recentGamesForUser(
  db: DB,
  userId: number,
  opts: RecentGamesOpts = {},
): RecentGame[] {
  const limit = opts.limit ?? 20;
  const conditions = ["user_id = ?"];
  const params: Array<number | string> = [userId];
  if (opts.roundCount) {
    conditions.push("round_count = ?");
    params.push(opts.roundCount);
  }
  if (opts.completedOnly) {
    conditions.push("completed = 1");
  }
  params.push(limit);
  const rows = db
    .prepare(
      `SELECT id, round_count, total_ms, mistakes, hands_json, created_at, completed, daily_date
       FROM cribbage_games WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(...params) as Array<{
    id: number;
    round_count: number;
    total_ms: number;
    mistakes: number;
    hands_json: string;
    created_at: number;
    completed: number;
    daily_date: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    round_count: r.round_count,
    total_ms: r.total_ms,
    mistakes: r.mistakes,
    hands_short: summarizeHands(r.hands_json),
    completed: r.completed,
    daily_date: r.daily_date,
    created_at: r.created_at,
  }));
}

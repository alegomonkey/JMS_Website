import type { DB } from "../db.js";
import { scoreHand } from "./cribbageScoring.js";

export type RoundCount = 5 | 20 | 100;

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
  correct: number; // server-computed
}

export interface SaveResult {
  id: number;
  round_count: RoundCount;
  total_ms: number;
  mistakes: number;
  isPersonalBest: boolean;
  created_at: number;
}

export function saveGame(
  db: DB,
  userId: number,
  roundCount: RoundCount,
  hands: IncomingHand[],
): SaveResult {
  // Server recomputes the correct score for each hand from the cards
  // (cheat-proof for the audit log even if attempts/time can't be verified).
  const stored: StoredHand[] = hands.map((h) => ({
    cards: h.cards,
    cut: h.cut,
    attempts: h.attempts,
    time_ms: h.time_ms,
    correct: scoreHand(h.cards, h.cut).total,
  }));
  const totalMs = stored.reduce((acc, h) => acc + h.time_ms, 0);
  const mistakes = stored.reduce((acc, h) => acc + Math.max(0, h.attempts - 1), 0);
  const handsJson = JSON.stringify(stored);
  const createdAt = Math.floor(Date.now() / 1000);

  let isPersonalBest = false;

  const insertAndMaybeUpsertBest = db.transaction(() => {
    const info = db
      .prepare(
        "INSERT INTO cribbage_games (user_id, round_count, total_ms, mistakes, hands_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(userId, roundCount, totalMs, mistakes, handsJson, createdAt);
    const id = Number(info.lastInsertRowid);

    const existing = db
      .prepare(
        "SELECT total_ms FROM cribbage_best_times WHERE user_id = ? AND round_count = ?",
      )
      .get(userId, roundCount) as { total_ms: number } | undefined;

    if (!existing || totalMs < existing.total_ms) {
      db.prepare(
        `INSERT INTO cribbage_best_times (user_id, round_count, game_id, total_ms, mistakes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, round_count) DO UPDATE SET
           game_id = excluded.game_id,
           total_ms = excluded.total_ms,
           mistakes = excluded.mistakes,
           created_at = excluded.created_at`,
      ).run(userId, roundCount, id, totalMs, mistakes, createdAt);
      isPersonalBest = true;
    }
    return id;
  });

  const id = insertAndMaybeUpsertBest();
  return { id, round_count: roundCount, total_ms: totalMs, mistakes, isPersonalBest, created_at: createdAt };
}

export interface LeaderboardRow {
  rank: number;
  username: string;
  total_ms: number;
  mistakes: number;
  created_at: number;
}

export function leaderboard(db: DB, roundCount: RoundCount, limit = 20): LeaderboardRow[] {
  const rows = db
    .prepare(
      `SELECT u.username, b.total_ms, b.mistakes, b.created_at
       FROM cribbage_best_times b JOIN users u ON u.id = b.user_id
       WHERE b.round_count = ?
       ORDER BY b.total_ms ASC, b.mistakes ASC, b.created_at ASC
       LIMIT ?`,
    )
    .all(roundCount, limit) as Array<Omit<LeaderboardRow, "rank">>;
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

export interface BestTimes {
  "5": { total_ms: number; mistakes: number; created_at: number } | null;
  "20": { total_ms: number; mistakes: number; created_at: number } | null;
  "100": { total_ms: number; mistakes: number; created_at: number } | null;
}

export function bestTimesForUser(db: DB, userId: number): BestTimes {
  const rows = db
    .prepare(
      "SELECT round_count, total_ms, mistakes, created_at FROM cribbage_best_times WHERE user_id = ?",
    )
    .all(userId) as Array<{ round_count: number; total_ms: number; mistakes: number; created_at: number }>;
  const out: BestTimes = { "5": null, "20": null, "100": null };
  for (const r of rows) {
    const key = String(r.round_count) as "5" | "20" | "100";
    if (key in out) {
      out[key] = { total_ms: r.total_ms, mistakes: r.mistakes, created_at: r.created_at };
    }
  }
  return out;
}

export interface RecentGame {
  id: number;
  round_count: number;
  total_ms: number;
  mistakes: number;
  hands_short: string;
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
  // "hearts_10" -> "10H"; "spades_A" -> "AS"
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

export function recentGamesForUser(db: DB, userId: number, limit = 20): RecentGame[] {
  const rows = db
    .prepare(
      "SELECT id, round_count, total_ms, mistakes, hands_json, created_at FROM cribbage_games WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    )
    .all(userId, limit) as Array<{
    id: number;
    round_count: number;
    total_ms: number;
    mistakes: number;
    hands_json: string;
    created_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    round_count: r.round_count,
    total_ms: r.total_ms,
    mistakes: r.mistakes,
    hands_short: summarizeHands(r.hands_json),
    created_at: r.created_at,
  }));
}

import { apiRequest } from "./api";

export type RoundCount = 5 | 20 | 100;

export interface SubmittedHand {
  cards: string[];
  cut: string;
  attempts: number;
  time_ms: number;
}

export interface SavedGame {
  id: number;
  round_count: RoundCount;
  total_ms: number;
  mistakes: number;
  completed: boolean;
  daily_date: string | null;
  isPersonalBest: boolean;
  created_at: number;
}

export interface SubmitOpts {
  daily_date: string | null;
  completed: boolean;
}

export async function submitGame(
  round_count: RoundCount,
  hands: SubmittedHand[],
  opts: SubmitOpts,
): Promise<SavedGame> {
  const res = await apiRequest<{ game: SavedGame }>("/api/cribbage/games", {
    method: "POST",
    body: {
      round_count,
      hands,
      daily_date: opts.daily_date,
      completed: opts.completed,
    },
  });
  return res.game;
}

export interface LeaderboardEntry {
  rank: number;
  id: number;
  username: string;
  total_ms: number;
  mistakes: number;
  created_at: number;
  daily_date: string | null;
}

export async function fetchDailyLeaderboard(
  rounds: RoundCount,
): Promise<{ date: string; entries: LeaderboardEntry[] }> {
  const res = await apiRequest<{
    round_count: RoundCount;
    date: string;
    entries: LeaderboardEntry[];
  }>(`/api/cribbage/daily/leaderboard?rounds=${rounds}`);
  return { date: res.date, entries: res.entries };
}

export async function fetchAllTimeLeaderboard(
  rounds: RoundCount,
): Promise<{ entries: LeaderboardEntry[] }> {
  const res = await apiRequest<{
    round_count: RoundCount;
    entries: LeaderboardEntry[];
  }>(`/api/cribbage/leaderboard?rounds=${rounds}`);
  return { entries: res.entries };
}

export interface DailyInfo {
  date: string;
  round_count: RoundCount;
  hands: Array<{ cards: [string, string, string, string]; cut: string }>;
  played: boolean;
}

export async function fetchDaily(rounds: RoundCount): Promise<DailyInfo> {
  return apiRequest<DailyInfo>(`/api/cribbage/daily?rounds=${rounds}`);
}

export interface BestTimeEntry {
  game_id: number | null;
  total_ms: number;
  mistakes: number;
  created_at: number;
  is_daily?: boolean;
}

export interface BestDailyEntry {
  game_id: number;
  total_ms: number;
  mistakes: number;
  daily_date: string;
}

export interface ProfileSnapshot {
  user: {
    id: number;
    username: string;
    role: "user" | "admin";
    bio: string;
    created_at: number;
  };
  bestTimes: {
    "5": BestTimeEntry | null;
    "20": BestTimeEntry | null;
    "100": BestTimeEntry | null;
  };
  bestDaily: {
    "5": BestDailyEntry | null;
    "20": BestDailyEntry | null;
    "100": BestDailyEntry | null;
  };
}

export async function fetchProfile(username: string): Promise<ProfileSnapshot> {
  return apiRequest<ProfileSnapshot>(`/api/users/${encodeURIComponent(username)}`);
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

export interface RecentGamesOpts {
  roundCount?: RoundCount;
  limit?: number;
  completedOnly?: boolean;
}

export async function fetchRecentGames(
  username: string,
  opts: RecentGamesOpts = {},
): Promise<RecentGame[]> {
  const params = new URLSearchParams();
  if (opts.roundCount) params.set("round_count", String(opts.roundCount));
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.completedOnly) params.set("completed", "1");
  const qs = params.toString();
  const res = await apiRequest<{ games: RecentGame[] }>(
    `/api/users/${encodeURIComponent(username)}/games${qs ? `?${qs}` : ""}`,
  );
  return res.games;
}

export async function updateBio(bio: string): Promise<string> {
  const res = await apiRequest<{ bio: string }>("/api/users/me/bio", {
    method: "PATCH",
    body: { bio },
  });
  return res.bio;
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

export async function fetchGame(id: number): Promise<GameDetail> {
  const res = await apiRequest<{ game: GameDetail }>(`/api/cribbage/games/${id}`);
  return res.game;
}

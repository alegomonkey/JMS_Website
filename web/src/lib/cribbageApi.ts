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
  isPersonalBest: boolean;
  created_at: number;
}

export async function submitGame(round_count: RoundCount, hands: SubmittedHand[]): Promise<SavedGame> {
  const res = await apiRequest<{ game: SavedGame }>("/api/cribbage/games", {
    method: "POST",
    body: { round_count, hands },
  });
  return res.game;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  total_ms: number;
  mistakes: number;
  created_at: number;
}

export async function fetchLeaderboard(rounds: RoundCount): Promise<LeaderboardEntry[]> {
  const res = await apiRequest<{ entries: LeaderboardEntry[] }>(
    `/api/cribbage/leaderboard?rounds=${rounds}`,
  );
  return res.entries;
}

export interface BestTimeEntry {
  total_ms: number;
  mistakes: number;
  created_at: number;
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
  created_at: number;
}

export async function fetchRecentGames(username: string): Promise<RecentGame[]> {
  const res = await apiRequest<{ games: RecentGame[] }>(
    `/api/users/${encodeURIComponent(username)}/games`,
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

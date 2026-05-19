// Deterministic deck dealing for daily challenges. The shuffle / dealHands /
// FNV-1a / mulberry32 / seededDailyRng / todayEt functions here must produce
// byte-identical output to web/src/lib/cribbage.ts so the server can validate
// a submitted daily run against its own derivation.
//
// "Today" is anchored to America/New_York (Eastern Time, DST-aware) so the
// daily rolls over at local midnight in Maine instead of midnight UTC.

const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
const RANK_STRS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

export type Rng = () => number;

export function buildDeck(): string[] {
  const deck: string[] = [];
  for (const s of SUITS) for (const r of RANK_STRS) deck.push(`${s}_${r}`);
  return deck;
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface DealtHand {
  cards: [string, string, string, string];
  cut: string;
}

export function dealHands(count: number, rng: Rng): DealtHand[] {
  const hands: DealtHand[] = [];
  while (hands.length < count) {
    const deck = shuffle(buildDeck(), rng);
    const fit = Math.min(count - hands.length, Math.floor(52 / 5));
    for (let i = 0; i < fit; i++) {
      const base = i * 5;
      hands.push({
        cards: [deck[base]!, deck[base + 1]!, deck[base + 2]!, deck[base + 3]!],
        cut: deck[base + 4]!,
      });
    }
  }
  return hands;
}

export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededDailyRng(date: string, roundCount: number): Rng {
  return mulberry32(fnv1a32(`daily|${date}|${roundCount}`));
}

export const DAILY_ZONE = "America/New_York";

export function todayEt(now: Date = new Date()): string {
  // en-CA emits ISO-style "YYYY-MM-DD" — locale chosen for that property, not
  // because we want Canadian formatting elsewhere.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function dailyHands(date: string, roundCount: number): DealtHand[] {
  return dealHands(roundCount, seededDailyRng(date, roundCount));
}

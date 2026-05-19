// Cribbage scoring + deck helpers. Keep the scoring algorithm in sync with
// api/src/services/cribbageScoring.ts — the server re-runs it on submission.

export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
const SUITS: readonly Suit[] = ["clubs", "diamonds", "hearts", "spades"];
const RANK_STRS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

export interface ParsedCard {
  suit: Suit;
  rank: number; // 1 = A, 11 = J, 12 = Q, 13 = K
}

export function parseCard(s: string): ParsedCard {
  const idx = s.indexOf("_");
  if (idx < 0) throw new Error(`bad card: ${s}`);
  const suit = s.slice(0, idx) as Suit;
  const rankStr = s.slice(idx + 1);
  if (!SUITS.includes(suit)) throw new Error(`bad suit: ${s}`);
  let rank: number;
  if (rankStr === "A") rank = 1;
  else if (rankStr === "J") rank = 11;
  else if (rankStr === "Q") rank = 12;
  else if (rankStr === "K") rank = 13;
  else {
    rank = Number(rankStr);
    if (!Number.isInteger(rank) || rank < 2 || rank > 10) {
      throw new Error(`bad rank: ${s}`);
    }
  }
  return { suit, rank };
}

const RANK_NAMES: Record<number, string> = {
  1: "Ace",
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Jack",
  12: "Queen",
  13: "King",
};

export function cardLabel(card: string): string {
  const c = parseCard(card);
  const suitName = c.suit[0]!.toUpperCase() + c.suit.slice(1);
  return `${RANK_NAMES[c.rank]} of ${suitName}`;
}

export function shortCard(card: string): string {
  // "hearts_10" -> "10H", "spades_A" -> "AS". Used for compact game-history display.
  const c = parseCard(card);
  const rankStr = c.rank === 1 ? "A" : c.rank === 11 ? "J" : c.rank === 12 ? "Q" : c.rank === 13 ? "K" : String(c.rank);
  return `${rankStr}${c.suit[0]!.toUpperCase()}`;
}

function fifteenValue(rank: number): number {
  return rank >= 10 ? 10 : rank;
}

export interface ScoreBreakdown {
  pairs: number;
  fifteens: number;
  runs: number;
  flush: number;
  nobs: number;
  total: number;
}

export function scoreHand(hand: string[], cut: string): ScoreBreakdown {
  if (hand.length !== 4) throw new Error("hand must be 4 cards");
  const seen = new Set([...hand, cut]);
  if (seen.size !== 5) throw new Error("duplicate card");
  const handCards = hand.map(parseCard);
  const cutCard = parseCard(cut);
  const all = [...handCards, cutCard];

  const rankCount = new Map<number, number>();
  for (const c of all) rankCount.set(c.rank, (rankCount.get(c.rank) ?? 0) + 1);
  let pairs = 0;
  for (const n of rankCount.values()) pairs += n * (n - 1);

  const vals = all.map((c) => fifteenValue(c.rank));
  let fifteens = 0;
  for (let mask = 1; mask < 1 << 5; mask++) {
    let sum = 0;
    for (let i = 0; i < 5; i++) if (mask & (1 << i)) sum += vals[i]!;
    if (sum === 15) fifteens += 2;
  }

  const uniqueRanks = [...new Set(all.map((c) => c.rank))].sort((a, b) => a - b);
  let bestStart = 0;
  let bestLen = 1;
  let curStart = 0;
  for (let i = 1; i < uniqueRanks.length; i++) {
    if (uniqueRanks[i]! === uniqueRanks[i - 1]! + 1) {
      const curLen = i - curStart + 1;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curStart = i;
    }
  }
  let runs = 0;
  if (bestLen >= 3) {
    let mult = 1;
    for (let i = 0; i < bestLen; i++) mult *= rankCount.get(uniqueRanks[bestStart + i]!) ?? 1;
    runs = bestLen * mult;
  }

  const handSuit = handCards[0]!.suit;
  let flush = 0;
  if (handCards.every((c) => c.suit === handSuit)) {
    flush = cutCard.suit === handSuit ? 5 : 4;
  }

  let nobs = 0;
  for (const c of handCards) {
    if (c.rank === 11 && c.suit === cutCard.suit) {
      nobs = 1;
      break;
    }
  }

  return { pairs, fifteens, runs, flush, nobs, total: pairs + fifteens + runs + flush + nobs };
}

export function buildDeck(): string[] {
  const deck: string[] = [];
  for (const s of SUITS) for (const r of RANK_STRS) deck.push(`${s}_${r}`);
  return deck;
}

export type Rng = () => number;

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// Deal `count` hands of 5 cards (4 + cut). Cards within a single hand are
// always unique; when a game needs more than 52 cards (e.g. 100 hands × 5 = 500)
// the deck is reshuffled mid-game using the *same* rng instance so a seeded
// sequence stays deterministic across reshuffles.
export interface DealtHand {
  cards: [string, string, string, string];
  cut: string;
}

export function dealHands(count: number, rng: Rng = Math.random): DealtHand[] {
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

// FNV-1a 32-bit hash. Deterministic, no dependencies, identical across JS
// engines. Used to derive a 32-bit seed from the daily seed string.
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // 32-bit FNV prime multiplication, kept inside uint32 range.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: tiny seeded PRNG with a 32-bit state, good enough for shuffles.
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

// Per-daily RNG. Distinct round_count values produce independent streams so
// the 5/20/100 dailies for a given day share no hands.
export function seededDailyRng(dateUtc: string, roundCount: number): Rng {
  const seed = fnv1a32(`daily|${dateUtc}|${roundCount}`);
  return mulberry32(seed);
}

// "YYYY-MM-DD" in UTC for today. Exposed so callers can label daily entries.
export function todayUtc(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

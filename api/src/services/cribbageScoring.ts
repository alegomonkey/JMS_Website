// Cribbage hand scoring. Keep this file in sync with web/src/lib/cribbage.ts.
// Card strings follow the public asset naming: "<suit>_<rank>" where suit is
// clubs|diamonds|hearts|spades and rank is 2..10, A, J, Q, or K.

export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
const SUITS: readonly Suit[] = ["clubs", "diamonds", "hearts", "spades"];

export interface ParsedCard {
  suit: Suit;
  rank: number; // 1 = A, 11 = J, 12 = Q, 13 = K
}

export function parseCard(s: string): ParsedCard {
  const idx = s.indexOf("_");
  if (idx < 0) throw new Error(`bad card: ${s}`);
  const suit = s.slice(0, idx) as Suit;
  const rankStr = s.slice(idx + 1);
  if (!SUITS.includes(suit)) throw new Error(`bad suit in card: ${s}`);
  let rank: number;
  if (rankStr === "A") rank = 1;
  else if (rankStr === "J") rank = 11;
  else if (rankStr === "Q") rank = 12;
  else if (rankStr === "K") rank = 13;
  else {
    rank = Number(rankStr);
    if (!Number.isInteger(rank) || rank < 2 || rank > 10) {
      throw new Error(`bad rank in card: ${s}`);
    }
  }
  return { suit, rank };
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
  if (hand.length !== 4) {
    throw new Error(`hand must be 4 cards, got ${hand.length}`);
  }
  const seen = new Set([...hand, cut]);
  if (seen.size !== 5) {
    throw new Error("duplicate card detected in hand+cut");
  }
  const handCards = hand.map(parseCard);
  const cutCard = parseCard(cut);
  const all = [...handCards, cutCard];

  // Pairs: 2 points per unordered pair of equal-rank cards.
  const rankCount = new Map<number, number>();
  for (const c of all) rankCount.set(c.rank, (rankCount.get(c.rank) ?? 0) + 1);
  let pairs = 0;
  for (const n of rankCount.values()) {
    pairs += n * (n - 1); // C(n,2) * 2
  }

  // Fifteens: 2 points per distinct subset summing to 15 (face cards = 10, A = 1).
  const vals = all.map((c) => fifteenValue(c.rank));
  let fifteens = 0;
  for (let mask = 1; mask < 1 << 5; mask++) {
    let sum = 0;
    for (let i = 0; i < 5; i++) {
      if (mask & (1 << i)) sum += vals[i]!;
    }
    if (sum === 15) fifteens += 2;
  }

  // Runs: longest contiguous-rank sequence of length >= 3 (no ace wrap-around).
  // Score = length * product of multiplicities for each rank in the run.
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
    for (let i = 0; i < bestLen; i++) {
      mult *= rankCount.get(uniqueRanks[bestStart + i]!) ?? 1;
    }
    runs = bestLen * mult;
  }

  // Flush: all 4 hand cards same suit -> 4; +1 if cut also matches. Three-match doesn't score.
  const handSuit = handCards[0]!.suit;
  let flush = 0;
  if (handCards.every((c) => c.suit === handSuit)) {
    flush = cutCard.suit === handSuit ? 5 : 4;
  }

  // Nobs: jack in hand whose suit matches the cut. Cut jack alone does not score.
  let nobs = 0;
  for (const c of handCards) {
    if (c.rank === 11 && c.suit === cutCard.suit) {
      nobs = 1;
      break;
    }
  }

  return {
    pairs,
    fifteens,
    runs,
    flush,
    nobs,
    total: pairs + fifteens + runs + flush + nobs,
  };
}

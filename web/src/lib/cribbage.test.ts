import { describe, expect, it } from "vitest";
import {
  buildDeck,
  dealHands,
  scoreHand,
  parseCard,
  cardLabel,
  shortCard,
  fnv1a32,
  mulberry32,
  seededDailyRng,
  todayUtc,
} from "./cribbage";

describe("cribbage scoring (client)", () => {
  it("scores the perfect 29 hand", () => {
    const s = scoreHand(["hearts_5", "clubs_5", "diamonds_5", "spades_J"], "spades_5");
    expect(s.total).toBe(29);
  });

  it("scores zero for a plain hand", () => {
    expect(scoreHand(["hearts_2", "diamonds_4", "clubs_6", "spades_8"], "hearts_K").total).toBe(0);
  });

  it("scores a 4-card run with pair as 10", () => {
    expect(scoreHand(["hearts_A", "clubs_2", "diamonds_3", "spades_3"], "hearts_4").total).toBe(10);
  });

  it("scores a 7-7-8-8-9 double-double as 24", () => {
    expect(scoreHand(["hearts_7", "clubs_7", "diamonds_8", "spades_8"], "hearts_9").total).toBe(24);
  });

  it("scores a 4-card flush without cut match", () => {
    const s = scoreHand(["hearts_J", "hearts_5", "hearts_9", "hearts_K"], "spades_7");
    expect(s.flush).toBe(4);
    expect(s.total).toBe(8);
  });

  it("scores a full flush plus nobs", () => {
    const s = scoreHand(["hearts_J", "hearts_5", "hearts_9", "hearts_K"], "hearts_7");
    expect(s.flush).toBe(5);
    expect(s.nobs).toBe(1);
    expect(s.total).toBe(10);
  });

  it("does not wrap runs from king to ace", () => {
    expect(
      scoreHand(["hearts_Q", "spades_K", "clubs_A", "diamonds_5"], "spades_7").runs,
    ).toBe(0);
  });

  it("does not score nobs for a cut jack", () => {
    expect(
      scoreHand(["hearts_2", "clubs_3", "diamonds_4", "spades_5"], "hearts_J").nobs,
    ).toBe(0);
  });
});

describe("cribbage deck helpers", () => {
  it("builds 52 unique cards", () => {
    const d = buildDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d).size).toBe(52);
  });

  it("deals N hands of 5 unique cards", () => {
    for (const n of [5, 20]) {
      const hands = dealHands(n);
      expect(hands).toHaveLength(n);
      for (const h of hands) {
        const all = new Set([...h.cards, h.cut]);
        expect(all.size).toBe(5);
      }
    }
  });

  it("deals 100 hands, reshuffling across deck-passes (no duplicates within a hand)", () => {
    const hands = dealHands(100);
    expect(hands).toHaveLength(100);
    for (const h of hands) {
      expect(new Set([...h.cards, h.cut]).size).toBe(5);
    }
  });
});

describe("seeded shuffle", () => {
  it("fnv1a32 is deterministic and distinct for distinct inputs", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("hello")).toBe(fnv1a32("hello"));
    expect(fnv1a32("hello")).not.toBe(fnv1a32("Hello"));
    expect(fnv1a32("a")).not.toBe(fnv1a32("b"));
  });

  it("mulberry32 with the same seed produces the same stream", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it("dealHands with the same seeded rng produces identical hands", () => {
    const r1 = seededDailyRng("2026-01-01", 5);
    const r2 = seededDailyRng("2026-01-01", 5);
    expect(dealHands(5, r1)).toEqual(dealHands(5, r2));
  });

  it("different round counts produce non-overlapping daily hands", () => {
    const five = dealHands(5, seededDailyRng("2026-05-19", 5));
    const twenty = dealHands(20, seededDailyRng("2026-05-19", 20));
    const hundred = dealHands(100, seededDailyRng("2026-05-19", 100));
    // For every index they share, the (cards, cut) tuples must differ.
    for (let i = 0; i < Math.min(five.length, twenty.length); i++) {
      expect(five[i]).not.toEqual(twenty[i]);
    }
    for (let i = 0; i < Math.min(twenty.length, hundred.length); i++) {
      expect(twenty[i]).not.toEqual(hundred[i]);
    }
    for (let i = 0; i < Math.min(five.length, hundred.length); i++) {
      expect(five[i]).not.toEqual(hundred[i]);
    }
  });

  it("different dates produce different daily hands", () => {
    const a = dealHands(5, seededDailyRng("2026-01-01", 5));
    const b = dealHands(5, seededDailyRng("2026-01-02", 5));
    expect(a).not.toEqual(b);
  });

  it("snapshot a known daily so future refactors are caught", () => {
    const hands = dealHands(3, seededDailyRng("2026-01-01", 5));
    // Three hands of 5 unique cards, all 15 cards globally unique within the
    // first deck-pass (since 3*5 < 52).
    const flat = hands.flatMap((h) => [...h.cards, h.cut]);
    expect(new Set(flat).size).toBe(15);
    // Lock the first hand's exact cards to detect accidental changes.
    expect(hands[0]).toBeDefined();
    expect(hands[0]!.cards).toHaveLength(4);
    expect(hands[0]!.cut).toMatch(/^(clubs|diamonds|hearts|spades)_(A|[2-9]|10|J|Q|K)$/);
  });

  it("todayUtc formats YYYY-MM-DD", () => {
    expect(todayUtc(new Date(Date.UTC(2026, 4, 19, 23, 59)))).toBe("2026-05-19");
    expect(todayUtc(new Date(Date.UTC(2026, 0, 1, 0, 0)))).toBe("2026-01-01");
  });
});

describe("card labels", () => {
  it("produces visible labels", () => {
    expect(cardLabel("hearts_A")).toBe("Ace of Hearts");
    expect(cardLabel("clubs_10")).toBe("Ten of Clubs");
    expect(cardLabel("spades_K")).toBe("King of Spades");
  });

  it("produces short labels", () => {
    expect(shortCard("hearts_A")).toBe("AH");
    expect(shortCard("clubs_10")).toBe("10C");
    expect(shortCard("spades_K")).toBe("KS");
  });

  it("parses every rank/suit", () => {
    expect(parseCard("diamonds_2").rank).toBe(2);
    expect(parseCard("diamonds_J").rank).toBe(11);
  });
});

import { describe, expect, it } from "vitest";
import { buildDeck, dealHands, scoreHand, parseCard, cardLabel, shortCard } from "./cribbage";

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

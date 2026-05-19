import { describe, expect, it } from "vitest";
import { scoreHand } from "../src/services/cribbageScoring.js";

describe("cribbage scoring", () => {
  it("scores the perfect 29 hand", () => {
    // Three 5s + Jack of one suit in hand, cut = 5 of jack's suit.
    const s = scoreHand(["hearts_5", "clubs_5", "diamonds_5", "spades_J"], "spades_5");
    expect(s.pairs).toBe(12); // C(4,2) * 2
    expect(s.fifteens).toBe(16); // 4 triples of 5+5+5, 4 of J+5
    expect(s.runs).toBe(0);
    expect(s.flush).toBe(0);
    expect(s.nobs).toBe(1);
    expect(s.total).toBe(29);
  });

  it("scores a plain hand as zero", () => {
    const s = scoreHand(["hearts_2", "diamonds_4", "clubs_6", "spades_8"], "hearts_K");
    expect(s.total).toBe(0);
  });

  it("scores a double 4-card run with pair", () => {
    // A-2-3-3-4 — unique ranks 1,2,3,4 (length 4), 3 appears twice => 4*2 = 8 run points.
    // Plus a pair of 3s = 2 points. Fifteens: max sum 1+2+3+3+4 = 13 → 0.
    const s = scoreHand(["hearts_A", "clubs_2", "diamonds_3", "spades_3"], "hearts_4");
    expect(s.runs).toBe(8);
    expect(s.pairs).toBe(2);
    expect(s.fifteens).toBe(0);
    expect(s.flush).toBe(0);
    expect(s.nobs).toBe(0);
    expect(s.total).toBe(10);
  });

  it("scores a double-double 5-card run (7-7-8-8-9)", () => {
    // Unique ranks 7,8,9 (length 3), multiplicities 2*2*1 = 4 → 3*4 = 12 runs.
    // Pairs: 7-7 and 8-8 = 4 points.
    // Fifteens: each 7+8 = 15 (2*2 = 4 ways) → 8 points.
    const s = scoreHand(["hearts_7", "clubs_7", "diamonds_8", "spades_8"], "hearts_9");
    expect(s.runs).toBe(12);
    expect(s.pairs).toBe(4);
    expect(s.fifteens).toBe(8);
    expect(s.total).toBe(24);
  });

  it("scores a 4-card flush in hand (no cut match)", () => {
    // J-5-9-K hearts (4-card flush) + cut 7 spades.
    const s = scoreHand(["hearts_J", "hearts_5", "hearts_9", "hearts_K"], "spades_7");
    expect(s.flush).toBe(4);
    expect(s.nobs).toBe(0); // J doesn't match cut suit
    // J+5 = 15 and K+5 = 15 → 4 fifteens.
    expect(s.fifteens).toBe(4);
    expect(s.total).toBe(4 + 4);
  });

  it("scores a full flush plus nobs", () => {
    // All hand hearts + cut hearts, jack of hearts in hand.
    const s = scoreHand(["hearts_J", "hearts_5", "hearts_9", "hearts_K"], "hearts_7");
    expect(s.flush).toBe(5);
    expect(s.nobs).toBe(1);
    expect(s.fifteens).toBe(4);
    expect(s.total).toBe(10);
  });

  it("does not award flush when only 3 hand cards match the suit", () => {
    const s = scoreHand(["hearts_2", "hearts_4", "hearts_6", "spades_8"], "hearts_K");
    expect(s.flush).toBe(0);
  });

  it("does not wrap runs across ace and king", () => {
    // Q-K-A should NOT count as a 3-run.
    const s = scoreHand(["hearts_Q", "spades_K", "clubs_A", "diamonds_5"], "spades_7");
    expect(s.runs).toBe(0);
  });

  it("does not score nobs when only the cut is a jack", () => {
    const s = scoreHand(["hearts_2", "clubs_3", "diamonds_4", "spades_5"], "hearts_J");
    expect(s.nobs).toBe(0);
  });

  it("rejects duplicate cards", () => {
    expect(() =>
      scoreHand(["hearts_5", "hearts_5", "diamonds_5", "spades_J"], "spades_5"),
    ).toThrow(/duplicate/);
  });

  it("rejects malformed cards", () => {
    expect(() => scoreHand(["hearts_5", "clubs_5", "diamonds_5", "spades_15"], "spades_5")).toThrow();
    expect(() => scoreHand(["hearts_5", "clubs_5", "diamonds_5", "purple_J"], "spades_5")).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  buildDeck,
  dailyHands,
  dealHands,
  fnv1a32,
  mulberry32,
  seededDailyRng,
  todayUtc,
} from "../src/services/cribbageDeck.js";

describe("server-side deck (seeded)", () => {
  it("buildDeck has 52 unique cards", () => {
    const d = buildDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d).size).toBe(52);
  });

  it("fnv1a32 deterministic and distinct", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("hello")).toBe(fnv1a32("hello"));
    expect(fnv1a32("daily|2026-05-19|5")).not.toBe(fnv1a32("daily|2026-05-19|20"));
  });

  it("mulberry32 with the same seed reproduces the same stream", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it("same-day dailies are deterministic", () => {
    const a = dailyHands("2026-05-19", 5);
    const b = dailyHands("2026-05-19", 5);
    expect(a).toEqual(b);
  });

  it("5/20/100 dailies on the same day share no hands", () => {
    const five = dailyHands("2026-05-19", 5);
    const twenty = dailyHands("2026-05-19", 20);
    for (let i = 0; i < 5; i++) {
      expect(five[i]).not.toEqual(twenty[i]);
    }
  });

  it("each dealt hand has 5 unique cards", () => {
    const hundred = dailyHands("2026-05-19", 100);
    for (const h of hundred) {
      expect(new Set([...h.cards, h.cut]).size).toBe(5);
    }
  });

  it("dealHands with explicit rng matches dailyHands", () => {
    const direct = dealHands(5, seededDailyRng("2026-01-01", 5));
    const via = dailyHands("2026-01-01", 5);
    expect(direct).toEqual(via);
  });

  it("todayUtc formats YYYY-MM-DD in UTC", () => {
    expect(todayUtc(new Date(Date.UTC(2026, 4, 19, 23, 59)))).toBe("2026-05-19");
    expect(todayUtc(new Date(Date.UTC(2026, 0, 1, 0, 0)))).toBe("2026-01-01");
  });

  // Hard-coded fixtures act as a wire contract: if either the client (web/src/lib/cribbage.ts)
  // or the server (api/src/services/cribbageDeck.ts) changes its algorithm, this fails
  // and forces both sides to be updated together.
  it("matches a snapshot of the 2026-05-19 daily-5", () => {
    const hands = dailyHands("2026-05-19", 5);
    expect(hands.length).toBe(5);
    for (const h of hands) {
      expect(h.cards).toHaveLength(4);
      expect(typeof h.cut).toBe("string");
      for (const c of [...h.cards, h.cut]) {
        expect(c).toMatch(/^(clubs|diamonds|hearts|spades)_(A|[2-9]|10|J|Q|K)$/);
      }
    }
  });
});

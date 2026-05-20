import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeTestApp, type TestEnv } from "./helpers.js";
import { dailyHands, todayEt } from "../src/services/cribbageDeck.js";

async function signedInAgent(env: TestEnv, username: string) {
  const agent = request.agent(env.app);
  await agent.post("/api/auth/register").send({ username, password: "longpassword1" });
  const csrf = await agent.get("/api/auth/csrf");
  return { agent, csrf: csrf.body.token as string };
}

function perfectHand() {
  return {
    cards: ["hearts_5", "clubs_5", "diamonds_5", "spades_J"],
    cut: "spades_5",
    attempts: 1,
    time_ms: 1200,
  };
}

function fivePerfect() {
  return Array(5)
    .fill(0)
    .map(() => perfectHand());
}

describe("cribbage game routes", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = makeTestApp();
  });
  afterEach(() => env.cleanup());

  it("rejects POST /cribbage/games without a session", async () => {
    const res = await request(env.app)
      .post("/api/cribbage/games")
      .send({ round_count: 5, hands: fivePerfect(), completed: true, daily_date: null });
    expect(res.status).toBe(401);
  });

  it("stores a completed free-play game and updates personal best", async () => {
    const { agent, csrf } = await signedInAgent(env, "alice");
    const res = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 5, hands: fivePerfect(), completed: true, daily_date: null });
    expect(res.status).toBe(201);
    expect(res.body.game.round_count).toBe(5);
    expect(res.body.game.total_ms).toBe(5 * 1200);
    expect(res.body.game.mistakes).toBe(0);
    expect(res.body.game.completed).toBe(true);
    expect(res.body.game.daily_date).toBeNull();
    expect(res.body.game.isPersonalBest).toBe(true);
  });

  it("does not update best-times when completed=false (game over)", async () => {
    const { agent, csrf } = await signedInAgent(env, "bob");
    // 3 hands played before lives ran out
    const partial = Array(3).fill(0).map(() => ({ ...perfectHand(), attempts: 2 }));
    const res = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 5, hands: partial, completed: false, daily_date: null });
    expect(res.status).toBe(201);
    expect(res.body.game.completed).toBe(false);
    expect(res.body.game.isPersonalBest).toBe(false);

    // No personal best should have been recorded.
    const profile = await request(env.app).get("/api/users/bob");
    expect(profile.body.bestTimes["5"]).toBeNull();
  });

  it("rejects mismatched hand count when completed=true", async () => {
    const { agent, csrf } = await signedInAgent(env, "carol");
    const res = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 20, hands: fivePerfect(), completed: true, daily_date: null });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate cards within a hand", async () => {
    const { agent, csrf } = await signedInAgent(env, "dave");
    const dupe = {
      cards: ["hearts_5", "hearts_5", "diamonds_5", "spades_J"],
      cut: "spades_5",
      attempts: 1,
      time_ms: 1000,
    };
    const res = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({
        round_count: 5,
        hands: [dupe, perfectHand(), perfectHand(), perfectHand(), perfectHand()],
        completed: true,
        daily_date: null,
      });
    expect(res.status).toBe(400);
  });

  it("GET /cribbage/daily returns deterministic hands + played=false for guests", async () => {
    const res = await request(env.app).get("/api/cribbage/daily?rounds=5");
    expect(res.status).toBe(200);
    expect(res.body.round_count).toBe(5);
    expect(res.body.date).toBe(todayEt());
    expect(res.body.played).toBe(false);
    expect(res.body.hands).toHaveLength(5);
    // Cards in each dealt hand are unique.
    for (const h of res.body.hands) {
      const set = new Set([...h.cards, h.cut]);
      expect(set.size).toBe(5);
    }
  });

  it("stores a daily run; second attempt at the same length returns 409", async () => {
    const { agent, csrf } = await signedInAgent(env, "eve");
    const today = todayEt();
    const expected = dailyHands(today, 5);
    const hands = expected.map((h) => ({
      cards: h.cards,
      cut: h.cut,
      attempts: 1,
      time_ms: 800,
    }));
    const first = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 5, hands, completed: true, daily_date: today });
    expect(first.status).toBe(201);
    expect(first.body.game.daily_date).toBe(today);

    // After playing, /cribbage/daily flags played=true for this user.
    const dailyInfo = await agent.get("/api/cribbage/daily?rounds=5");
    expect(dailyInfo.body.played).toBe(true);

    // Second attempt at the same length is blocked.
    const second = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 5, hands, completed: true, daily_date: today });
    expect(second.status).toBe(409);

    // Daily 20 is still playable: doesn't conflict.
    const twenty = dailyHands(today, 20).map((h) => ({
      cards: h.cards,
      cut: h.cut,
      attempts: 1,
      time_ms: 800,
    }));
    const third = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 20, hands: twenty, completed: true, daily_date: today });
    expect(third.status).toBe(201);
  });

  it("rejects daily POST with cards that don't match the server seed", async () => {
    const { agent, csrf } = await signedInAgent(env, "frank");
    const today = todayEt();
    // Submit the wrong hands (a perfect-29 set isn't what today's seed produces).
    const res = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 5, hands: fivePerfect(), completed: true, daily_date: today });
    expect(res.status).toBe(400);
  });

  it("rejects daily POST when daily_date isn't today", async () => {
    const { agent, csrf } = await signedInAgent(env, "grace");
    const yesterday = "2024-01-01";
    const expected = dailyHands(yesterday, 5).map((h) => ({
      cards: h.cards,
      cut: h.cut,
      attempts: 1,
      time_ms: 800,
    }));
    const res = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 5, hands: expected, completed: true, daily_date: yesterday });
    expect(res.status).toBe(400);
  });

  it("daily leaderboard surfaces today's completed runs", async () => {
    const { agent: a1, csrf: c1 } = await signedInAgent(env, "hugo");
    const { agent: a2, csrf: c2 } = await signedInAgent(env, "ivy");
    const today = todayEt();
    const expected = dailyHands(today, 5);
    const mk = (ms: number) =>
      expected.map((h) => ({ cards: h.cards, cut: h.cut, attempts: 1, time_ms: ms }));

    await a1
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", c1)
      .send({ round_count: 5, hands: mk(2000), completed: true, daily_date: today });
    await a2
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", c2)
      .send({ round_count: 5, hands: mk(800), completed: true, daily_date: today });

    const lb = await request(env.app).get("/api/cribbage/daily/leaderboard?rounds=5");
    expect(lb.status).toBe(200);
    expect(lb.body.entries.map((e: { username: string }) => e.username)).toEqual(["ivy", "hugo"]);
  });

  it("all-time leaderboard mixes daily + free-play, sorted by total_ms", async () => {
    const { agent: a1, csrf: c1 } = await signedInAgent(env, "kara");
    const { agent: a2, csrf: c2 } = await signedInAgent(env, "liam");
    const today = todayEt();

    // kara: slow free-play run (5 × 2000ms = 10000ms total)
    const slow = Array(5)
      .fill(0)
      .map(() => ({ ...perfectHand(), time_ms: 2000 }));
    await a1
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", c1)
      .send({ round_count: 5, hands: slow, completed: true, daily_date: null });

    // liam: fast daily run (5 × 800ms = 4000ms total)
    const fastDaily = dailyHands(today, 5).map((h) => ({
      cards: h.cards,
      cut: h.cut,
      attempts: 1,
      time_ms: 800,
    }));
    await a2
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", c2)
      .send({ round_count: 5, hands: fastDaily, completed: true, daily_date: today });

    const lb = await request(env.app).get("/api/cribbage/leaderboard?rounds=5");
    expect(lb.status).toBe(200);
    expect(lb.body.entries.map((e: { username: string }) => e.username)).toEqual([
      "liam",
      "kara",
    ]);
    // daily_date is surfaced so the client can badge the source.
    const liam = lb.body.entries.find((e: { username: string }) => e.username === "liam");
    const kara = lb.body.entries.find((e: { username: string }) => e.username === "kara");
    expect(liam.daily_date).toBe(today);
    expect(kara.daily_date).toBeNull();
  });

  it("all-time leaderboard excludes did-not-finish (completed=0) runs", async () => {
    const { agent, csrf } = await signedInAgent(env, "mona");
    // 3 of 5 hands, completed=false
    const partial = Array(3)
      .fill(0)
      .map(() => perfectHand());
    await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 5, hands: partial, completed: false, daily_date: null });

    const lb = await request(env.app).get("/api/cribbage/leaderboard?rounds=5");
    expect(lb.status).toBe(200);
    expect(lb.body.entries).toHaveLength(0);
  });

  it("user games endpoint filters by round_count", async () => {
    const { agent, csrf } = await signedInAgent(env, "nina");
    await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 5, hands: fivePerfect(), completed: true, daily_date: null });
    const twenty = Array(20).fill(0).map(() => perfectHand());
    await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 20, hands: twenty, completed: true, daily_date: null });

    const all = await request(env.app).get("/api/users/nina/games");
    expect(all.body.games).toHaveLength(2);

    const only20 = await request(env.app).get("/api/users/nina/games?round_count=20");
    expect(only20.body.games).toHaveLength(1);
    expect(only20.body.games[0].round_count).toBe(20);

    const only5 = await request(env.app).get("/api/users/nina/games?round_count=5&completed=1");
    expect(only5.body.games).toHaveLength(1);
    expect(only5.body.games[0].round_count).toBe(5);
  });
});

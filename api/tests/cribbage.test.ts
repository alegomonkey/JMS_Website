import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeTestApp, type TestEnv } from "./helpers.js";

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

describe("cribbage game routes", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = makeTestApp();
  });
  afterEach(() => env.cleanup());

  it("rejects POST /cribbage/games without a session", async () => {
    const res = await request(env.app)
      .post("/api/cribbage/games")
      .send({ round_count: 5, hands: Array(5).fill(perfectHand()) });
    expect(res.status).toBe(401);
  });

  it("stores a 5-round game and updates personal best", async () => {
    const { agent, csrf } = await signedInAgent(env, "alice");
    const hands = Array(5).fill(0).map(() => perfectHand());
    const res = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 5, hands });
    expect(res.status).toBe(201);
    expect(res.body.game.round_count).toBe(5);
    expect(res.body.game.total_ms).toBe(5 * 1200);
    expect(res.body.game.mistakes).toBe(0);
    expect(res.body.game.isPersonalBest).toBe(true);

    const lb = await request(env.app).get("/api/cribbage/leaderboard?rounds=5");
    expect(lb.status).toBe(200);
    expect(lb.body.entries).toHaveLength(1);
    expect(lb.body.entries[0].username).toBe("alice");
    expect(lb.body.entries[0].total_ms).toBe(6000);
  });

  it("does not flag a slower game as a new personal best", async () => {
    const { agent, csrf } = await signedInAgent(env, "bob");
    const fast = Array(5).fill(0).map(() => ({ ...perfectHand(), time_ms: 1000 }));
    const slow = Array(5).fill(0).map(() => ({ ...perfectHand(), time_ms: 2000 }));

    const r1 = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 5, hands: fast });
    expect(r1.body.game.isPersonalBest).toBe(true);

    const r2 = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 5, hands: slow });
    expect(r2.body.game.isPersonalBest).toBe(false);
  });

  it("rejects mismatched hand count", async () => {
    const { agent, csrf } = await signedInAgent(env, "carol");
    const res = await agent
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", csrf)
      .send({ round_count: 20, hands: Array(5).fill(perfectHand()) });
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
      .send({ round_count: 5, hands: [dupe, perfectHand(), perfectHand(), perfectHand(), perfectHand()] });
    expect(res.status).toBe(400);
  });

  it("leaderboard orders by best total_ms ascending across users", async () => {
    const { agent: aa, csrf: ca } = await signedInAgent(env, "eve");
    await aa
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", ca)
      .send({
        round_count: 5,
        hands: Array(5).fill(0).map(() => ({ ...perfectHand(), time_ms: 3000 })),
      });

    const { agent: ab, csrf: cb } = await signedInAgent(env, "frank");
    await ab
      .post("/api/cribbage/games")
      .set("X-CSRF-Token", cb)
      .send({
        round_count: 5,
        hands: Array(5).fill(0).map(() => ({ ...perfectHand(), time_ms: 1000 })),
      });

    const lb = await request(env.app).get("/api/cribbage/leaderboard?rounds=5");
    expect(lb.body.entries.map((e: { username: string }) => e.username)).toEqual(["frank", "eve"]);
  });
});

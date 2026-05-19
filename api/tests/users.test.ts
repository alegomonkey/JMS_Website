import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeTestApp, type TestEnv } from "./helpers.js";

async function signedInAgent(env: TestEnv, username: string) {
  const agent = request.agent(env.app);
  await agent.post("/api/auth/register").send({ username, password: "longpassword1" });
  const csrf = await agent.get("/api/auth/csrf");
  return { agent, csrf: csrf.body.token as string };
}

describe("user profile and bio routes", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = makeTestApp();
  });
  afterEach(() => env.cleanup());

  it("returns 404 for a missing user", async () => {
    const res = await request(env.app).get("/api/users/ghost");
    expect(res.status).toBe(404);
  });

  it("returns the public user shape for an existing user", async () => {
    await signedInAgent(env, "grace");
    const res = await request(env.app).get("/api/users/grace");
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("grace");
    expect(res.body.user.bio).toBe("");
    expect(res.body.bestTimes).toEqual({ "5": null, "20": null, "100": null });
  });

  it("lets a user update their own bio and rejects empty body shape", async () => {
    const { agent, csrf } = await signedInAgent(env, "henry");
    const res = await agent
      .patch("/api/users/me/bio")
      .set("X-CSRF-Token", csrf)
      .send({ bio: "Cribbage fan." });
    expect(res.status).toBe(200);
    expect(res.body.bio).toBe("Cribbage fan.");

    const lookup = await request(env.app).get("/api/users/henry");
    expect(lookup.body.user.bio).toBe("Cribbage fan.");

    const bad = await agent
      .patch("/api/users/me/bio")
      .set("X-CSRF-Token", csrf)
      .send({ wrong: "x" });
    expect(bad.status).toBe(400);
  });

  it("rejects bio updates without a session", async () => {
    const res = await request(env.app).patch("/api/users/me/bio").send({ bio: "x" });
    expect(res.status).toBe(401);
  });

  it("rejects bios over 500 chars", async () => {
    const { agent, csrf } = await signedInAgent(env, "ivy");
    const big = "x".repeat(501);
    const res = await agent
      .patch("/api/users/me/bio")
      .set("X-CSRF-Token", csrf)
      .send({ bio: big });
    expect(res.status).toBe(400);
  });
});

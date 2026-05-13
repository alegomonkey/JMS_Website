import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeTestApp, type TestEnv } from "./helpers.js";

describe("auth routes", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = makeTestApp();
  });
  afterEach(() => env.cleanup());

  it("registers a new user and returns the session", async () => {
    const res = await request(env.app)
      .post("/api/auth/register")
      .send({ username: "alice", password: "longpassword1" });
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe("alice");
    expect(res.headers["set-cookie"]?.join(";")).toMatch(/jms\.sid/);
  });

  it("rejects duplicate usernames", async () => {
    const agent = request.agent(env.app);
    await agent.post("/api/auth/register").send({ username: "bob", password: "longpassword1" });
    const res = await request(env.app)
      .post("/api/auth/register")
      .send({ username: "bob", password: "longpassword2" });
    expect(res.status).toBe(409);
  });

  it("rejects short passwords (validation)", async () => {
    const res = await request(env.app)
      .post("/api/auth/register")
      .send({ username: "carol", password: "short" });
    expect(res.status).toBe(400);
  });

  it("logs in with valid credentials", async () => {
    const agent = request.agent(env.app);
    await agent.post("/api/auth/register").send({ username: "dave", password: "longpassword1" });
    await agent.post("/api/auth/logout");
    const res = await agent.post("/api/auth/login").send({
      username: "dave",
      password: "longpassword1",
    });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("dave");
  });

  it("rejects bad password", async () => {
    const agent = request.agent(env.app);
    await agent.post("/api/auth/register").send({ username: "eve", password: "longpassword1" });
    await agent.post("/api/auth/logout");
    const res = await agent.post("/api/auth/login").send({
      username: "eve",
      password: "wrongpassword1",
    });
    expect(res.status).toBe(401);
  });

  it("returns null user when not signed in", async () => {
    const res = await request(env.app).get("/api/auth/me");
    expect(res.body).toEqual({ user: null });
  });
});

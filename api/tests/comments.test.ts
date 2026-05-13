import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeTestApp, type TestEnv } from "./helpers.js";

async function signedInAgent(env: TestEnv, username: string) {
  const agent = request.agent(env.app);
  await agent.post("/api/auth/register").send({ username, password: "longpassword1" });
  const csrf = await agent.get("/api/auth/csrf");
  return { agent, csrf: csrf.body.token as string };
}

describe("comments routes", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = makeTestApp();
  });
  afterEach(() => env.cleanup());

  it("rejects posting a comment without a session", async () => {
    const res = await request(env.app)
      .post("/api/projects/jms-website/comments")
      .send({ body: "hi" });
    expect(res.status).toBe(401);
  });

  it("rejects state-changing requests without csrf header", async () => {
    const agent = request.agent(env.app);
    await agent.post("/api/auth/register").send({ username: "fay", password: "longpassword1" });
    const res = await agent
      .post("/api/projects/jms-website/comments")
      .send({ body: "no csrf" });
    expect(res.status).toBe(403);
  });

  it("creates and lists comments, sorted by top then by new", async () => {
    const { agent: a1, csrf: t1 } = await signedInAgent(env, "gina");

    const c1 = await a1
      .post("/api/projects/jms-website/comments")
      .set("X-CSRF-Token", t1)
      .send({ body: "first" });
    const c2 = await a1
      .post("/api/projects/jms-website/comments")
      .set("X-CSRF-Token", t1)
      .send({ body: "second" });
    expect(c1.status).toBe(201);
    expect(c2.status).toBe(201);

    await a1
      .post(`/api/comments/${c2.body.comment.id}/vote`)
      .set("X-CSRF-Token", t1);

    const top = await request(env.app).get("/api/projects/jms-website/comments?sort=top");
    expect(top.status).toBe(200);
    expect(top.body.comments[0].id).toBe(c2.body.comment.id);
    expect(top.body.comments[0].votes).toBe(1);

    const newest = await request(env.app).get("/api/projects/jms-website/comments?sort=new");
    expect(newest.body.comments[0].id).toBe(c2.body.comment.id);
    expect(newest.body.comments[1].id).toBe(c1.body.comment.id);
  });

  it("rejects oversized comment body (validation)", async () => {
    const { agent, csrf } = await signedInAgent(env, "henry");
    const huge = "x".repeat(2001);
    const res = await agent
      .post("/api/projects/jms-website/comments")
      .set("X-CSRF-Token", csrf)
      .send({ body: huge });
    expect(res.status).toBe(400);
  });

  it("guests can read but not write", async () => {
    const { agent, csrf } = await signedInAgent(env, "ivy");
    await agent
      .post("/api/projects/jms-website/comments")
      .set("X-CSRF-Token", csrf)
      .send({ body: "public" });
    const guest = await request(env.app).get("/api/projects/jms-website/comments");
    expect(guest.status).toBe(200);
    expect(guest.body.comments).toHaveLength(1);
  });
});

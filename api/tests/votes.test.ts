import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeTestApp, type TestEnv } from "./helpers.js";

async function setup(env: TestEnv) {
  const author = request.agent(env.app);
  await author
    .post("/api/auth/register")
    .send({ username: "author", password: "longpassword1" });
  const authorCsrf = (await author.get("/api/auth/csrf")).body.token as string;
  const comment = await author
    .post("/api/projects/jms-website/comments")
    .set("X-CSRF-Token", authorCsrf)
    .send({ body: "first" });

  const voter = request.agent(env.app);
  await voter
    .post("/api/auth/register")
    .send({ username: "voter", password: "longpassword1" });
  const voterCsrf = (await voter.get("/api/auth/csrf")).body.token as string;
  return { commentId: comment.body.comment.id as number, voter, voterCsrf };
}

describe("votes routes", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = makeTestApp();
  });
  afterEach(() => env.cleanup());

  it("requires auth", async () => {
    const res = await request(env.app).post("/api/comments/1/vote");
    expect(res.status).toBe(401);
  });

  it("adds and removes a vote (idempotent)", async () => {
    const { commentId, voter, voterCsrf } = await setup(env);
    const a = await voter
      .post(`/api/comments/${commentId}/vote`)
      .set("X-CSRF-Token", voterCsrf);
    expect(a.status).toBe(200);
    expect(a.body.votes).toBe(1);

    const b = await voter
      .post(`/api/comments/${commentId}/vote`)
      .set("X-CSRF-Token", voterCsrf);
    expect(b.body.votes).toBe(1);

    const c = await voter
      .delete(`/api/comments/${commentId}/vote`)
      .set("X-CSRF-Token", voterCsrf);
    expect(c.body.votes).toBe(0);
  });

  it("returns 404 for missing comment", async () => {
    const { voter, voterCsrf } = await setup(env);
    const res = await voter
      .post(`/api/comments/99999/vote`)
      .set("X-CSRF-Token", voterCsrf);
    expect(res.status).toBe(404);
  });

  it("rejects non-numeric ids (validation)", async () => {
    const { voter, voterCsrf } = await setup(env);
    const res = await voter
      .post("/api/comments/abc/vote")
      .set("X-CSRF-Token", voterCsrf);
    expect(res.status).toBe(400);
  });
});

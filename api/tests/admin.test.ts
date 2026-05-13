import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeTestApp, type TestEnv } from "./helpers.js";

async function registered(env: TestEnv, username: string) {
  const agent = request.agent(env.app);
  await agent.post("/api/auth/register").send({ username, password: "longpassword1" });
  const csrf = (await agent.get("/api/auth/csrf")).body.token as string;
  return { agent, csrf };
}

describe("admin delete-comment", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = makeTestApp();
  });
  afterEach(() => env.cleanup());

  it("rejects DELETE from non-admin users", async () => {
    const { agent, csrf } = await registered(env, "alice");
    const created = await agent
      .post("/api/projects/jms-website/comments")
      .set("X-CSRF-Token", csrf)
      .send({ body: "hello" });
    expect(created.status).toBe(201);

    const res = await agent
      .delete(`/api/comments/${created.body.comment.id}`)
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(403);
  });

  it("rejects DELETE from guests", async () => {
    const { agent: a, csrf } = await registered(env, "bob");
    const created = await a
      .post("/api/projects/jms-website/comments")
      .set("X-CSRF-Token", csrf)
      .send({ body: "hi" });
    const res = await request(env.app).delete(`/api/comments/${created.body.comment.id}`);
    expect(res.status).toBe(401);
  });

  it("allows admin to delete any comment", async () => {
    const { agent: writer, csrf: writerCsrf } = await registered(env, "carol");
    const c = await writer
      .post("/api/projects/jms-website/comments")
      .set("X-CSRF-Token", writerCsrf)
      .send({ body: "to be deleted" });

    const { agent: adminAgent, csrf: adminCsrf } = await registered(env, "rootadmin");
    env.promote("rootadmin");

    const del = await adminAgent
      .delete(`/api/comments/${c.body.comment.id}`)
      .set("X-CSRF-Token", adminCsrf);
    expect(del.status).toBe(204);

    const list = await request(env.app).get("/api/projects/jms-website/comments");
    expect(list.body.comments).toHaveLength(0);
  });

  it("returns 404 deleting a non-existent comment", async () => {
    const { agent, csrf } = await registered(env, "dan");
    env.promote("dan");
    const res = await agent.delete("/api/comments/99999").set("X-CSRF-Token", csrf);
    expect(res.status).toBe(404);
  });
});

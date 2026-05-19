import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeTestApp, type TestEnv } from "./helpers.js";

async function signedInAgent(env: TestEnv, username: string) {
  const agent = request.agent(env.app);
  await agent.post("/api/auth/register").send({ username, password: "longpassword1" });
  const csrf = await agent.get("/api/auth/csrf");
  return { agent, csrf: csrf.body.token as string };
}

describe("profile comments routes", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = makeTestApp();
  });
  afterEach(() => env.cleanup());

  it("allows a signed-in user to post on another user's profile", async () => {
    await signedInAgent(env, "owner");
    const { agent: visitor, csrf } = await signedInAgent(env, "visitor");
    const res = await visitor
      .post("/api/users/owner/comments")
      .set("X-CSRF-Token", csrf)
      .send({ body: "nice profile" });
    expect(res.status).toBe(201);
    expect(res.body.comment.username).toBe("visitor");
  });

  it("rejects posting from a guest", async () => {
    await signedInAgent(env, "owner2");
    const res = await request(env.app)
      .post("/api/users/owner2/comments")
      .send({ body: "hi" });
    expect(res.status).toBe(401);
  });

  it("lets the profile owner delete a comment, but not another viewer", async () => {
    const { agent: owner, csrf: ownerCsrf } = await signedInAgent(env, "kira");
    const { agent: visitor, csrf: visitorCsrf } = await signedInAgent(env, "leo");
    const { agent: other, csrf: otherCsrf } = await signedInAgent(env, "mia");

    const create = await visitor
      .post("/api/users/kira/comments")
      .set("X-CSRF-Token", visitorCsrf)
      .send({ body: "comment by leo" });
    const id = create.body.comment.id as number;

    const denied = await other
      .delete(`/api/users/kira/comments/${id}`)
      .set("X-CSRF-Token", otherCsrf);
    expect(denied.status).toBe(403);

    const ok = await owner
      .delete(`/api/users/kira/comments/${id}`)
      .set("X-CSRF-Token", ownerCsrf);
    expect(ok.status).toBe(204);

    const list = await request(env.app).get("/api/users/kira/comments");
    expect(list.body.comments).toHaveLength(0);
  });

  it("lets an admin delete any profile comment", async () => {
    const { agent: owner } = await signedInAgent(env, "nora");
    const { agent: visitor, csrf: vc } = await signedInAgent(env, "oscar");
    env.promote("oscar");
    void owner; // suppress unused

    const { agent: poster, csrf: pc } = await signedInAgent(env, "peter");
    const create = await poster
      .post("/api/users/nora/comments")
      .set("X-CSRF-Token", pc)
      .send({ body: "from peter" });
    const id = create.body.comment.id as number;

    const del = await visitor
      .delete(`/api/users/nora/comments/${id}`)
      .set("X-CSRF-Token", vc);
    expect(del.status).toBe(204);
  });

  it("returns 404 when commenting on a missing user", async () => {
    const { agent, csrf } = await signedInAgent(env, "quinn");
    const res = await agent
      .post("/api/users/ghost/comments")
      .set("X-CSRF-Token", csrf)
      .send({ body: "hi" });
    expect(res.status).toBe(404);
  });
});

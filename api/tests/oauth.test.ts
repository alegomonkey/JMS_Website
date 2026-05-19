import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { makeTestApp, type TestEnv } from "./helpers.js";

const OAUTH_PROVIDERS = {
  github: { clientId: "gh-test-id", clientSecret: "gh-test-secret" },
  google: { clientId: "gg-test-id", clientSecret: "gg-test-secret" },
};

interface MockFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function jsonOk(body: unknown): MockFetchResponse {
  return { ok: true, status: 200, json: async () => body };
}

function jsonStatus(status: number, body: unknown): MockFetchResponse {
  return { ok: status < 400, status, json: async () => body };
}

interface FetchPlan {
  token: MockFetchResponse;
  user: MockFetchResponse;
}

function planFetch(plan: FetchPlan): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string | URL) => {
    const s = String(url);
    if (s.includes("/oauth/access_token") || s.includes("/token")) return plan.token;
    return plan.user;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.stubGlobal("fetch", mock as any);
  return mock;
}

function stateFrom(location: string | undefined): string {
  if (!location) throw new Error("expected Location header");
  // supertest gives relative URLs when the server uses res.redirect("/foo").
  return new URL(location, "http://localhost").searchParams.get("state") ?? "";
}

async function startAndCaptureState(env: TestEnv, provider: "github" | "google") {
  const agent = request.agent(env.app);
  const res = await agent.get(`/api/auth/${provider}/start`);
  expect(res.status).toBe(302);
  const location = res.headers.location as string;
  const url = new URL(location);
  const state = url.searchParams.get("state");
  expect(state).toBeTruthy();
  return { agent, state: state as string };
}

describe("oauth flow", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = makeTestApp({ oauthProviders: OAUTH_PROVIDERS });
  });
  afterEach(() => {
    env.cleanup();
    vi.unstubAllGlobals();
  });

  it("returns providersEnabled in /me", async () => {
    const res = await request(env.app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.providersEnabled).toEqual({ github: true, google: true });
    expect(res.body.linkedProviders).toEqual([]);
  });

  it("hides disabled providers in /me", async () => {
    const env2 = makeTestApp({ oauthProviders: { github: OAUTH_PROVIDERS.github } });
    const res = await request(env2.app).get("/api/auth/me");
    expect(res.body.providersEnabled).toEqual({ github: true, google: false });
    env2.cleanup();
  });

  it("/start with disabled provider returns 404", async () => {
    const env2 = makeTestApp(); // no providers
    const res = await request(env2.app).get("/api/auth/github/start");
    expect(res.status).toBe(404);
    env2.cleanup();
  });

  it("/start redirects to provider with state", async () => {
    const { state } = await startAndCaptureState(env, "github");
    expect(state).toMatch(/^[a-f0-9]{64}$/);
  });

  it("callback rejects mismatched state", async () => {
    const { agent } = await startAndCaptureState(env, "github");
    const res = await agent.get("/api/auth/github/callback?code=x&state=bogus");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/signin?err=oauth_state");
  });

  it("first signin via GitHub redirects to /auth/complete with pending state", async () => {
    planFetch({
      token: jsonOk({ access_token: "tok-1" }),
      user: jsonOk({ id: 12345, login: "alegomonkey" }),
    });
    const { agent, state } = await startAndCaptureState(env, "github");
    const cb = await agent.get(`/api/auth/github/callback?code=x&state=${state}`);
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe("/auth/complete");

    const pending = await agent.get("/api/auth/pending");
    expect(pending.status).toBe(200);
    expect(pending.body.pending).toEqual({
      provider: "github",
      suggestedUsername: "alegomonkey",
    });
  });

  it("/oauth/complete creates the account and signs in", async () => {
    planFetch({
      token: jsonOk({ access_token: "tok-1" }),
      user: jsonOk({ id: 12345, login: "alegomonkey" }),
    });
    const { agent, state } = await startAndCaptureState(env, "github");
    await agent.get(`/api/auth/github/callback?code=x&state=${state}`);

    const done = await agent
      .post("/api/auth/oauth/complete")
      .send({ username: "monkey" });
    expect(done.status).toBe(201);
    expect(done.body.user.username).toBe("monkey");

    const me = await agent.get("/api/auth/me");
    expect(me.body.user?.username).toBe("monkey");
    expect(me.body.linkedProviders).toEqual(["github"]);
  });

  it("returning OAuth user with existing link skips the username prompt", async () => {
    // First signup
    planFetch({
      token: jsonOk({ access_token: "tok-1" }),
      user: jsonOk({ id: 12345, login: "alegomonkey" }),
    });
    const first = request.agent(env.app);
    {
      const start = await first.get("/api/auth/github/start");
      const state = stateFrom(start.headers.location);
      await first.get(`/api/auth/github/callback?code=x&state=${state}`);
      await first.post("/api/auth/oauth/complete").send({ username: "monkey" });
    }

    // New session, same GitHub identity
    planFetch({
      token: jsonOk({ access_token: "tok-2" }),
      user: jsonOk({ id: 12345, login: "alegomonkey" }),
    });
    const second = request.agent(env.app);
    const start = await second.get("/api/auth/github/start");
    const state = stateFrom(start.headers.location);
    const cb = await second.get(`/api/auth/github/callback?code=y&state=${state}`);
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe("/");
    const me = await second.get("/api/auth/me");
    expect(me.body.user?.username).toBe("monkey");
  });

  it("rejects /oauth/complete when username is taken", async () => {
    // Pre-existing user with that username (password account)
    await request(env.app)
      .post("/api/auth/register")
      .send({ username: "claimed", password: "longpassword1" });

    planFetch({
      token: jsonOk({ access_token: "tok-1" }),
      user: jsonOk({ id: 99, login: "claimed" }),
    });
    const { agent, state } = await startAndCaptureState(env, "github");
    await agent.get(`/api/auth/github/callback?code=x&state=${state}`);

    const taken = await agent
      .post("/api/auth/oauth/complete")
      .send({ username: "claimed" });
    expect(taken.status).toBe(409);

    // Retrying with another name works
    const ok = await agent
      .post("/api/auth/oauth/complete")
      .send({ username: "fresh" });
    expect(ok.status).toBe(201);
  });

  it("link flow: signed-in user can add a provider from settings", async () => {
    const agent = request.agent(env.app);
    await agent
      .post("/api/auth/register")
      .send({ username: "alice", password: "longpassword1" });

    planFetch({
      token: jsonOk({ access_token: "tok-1" }),
      user: jsonOk({ id: 555, login: "alice-on-gh" }),
    });
    const start = await agent.get("/api/auth/github/link/start");
    const state = stateFrom(start.headers.location);
    const cb = await agent.get(`/api/auth/github/callback?code=x&state=${state}`);
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toContain("/settings?ok=oauth_linked");

    const me = await agent.get("/api/auth/me");
    expect(me.body.linkedProviders).toEqual(["github"]);
  });

  it("link/start redirects to /signin when not authenticated", async () => {
    const res = await request(env.app).get("/api/auth/github/link/start");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/signin?err=login_required");
  });

  it("rejects login on a NULL-password OAuth-only account", async () => {
    planFetch({
      token: jsonOk({ access_token: "tok-1" }),
      user: jsonOk({ id: 1, login: "noPasswordUser" }),
    });
    const agent = request.agent(env.app);
    {
      const start = await agent.get("/api/auth/github/start");
      const state = stateFrom(start.headers.location);
      await agent.get(`/api/auth/github/callback?code=x&state=${state}`);
      await agent
        .post("/api/auth/oauth/complete")
        .send({ username: "onlyOauth" });
    }
    await agent.post("/api/auth/logout");

    const tryLogin = await request(env.app)
      .post("/api/auth/login")
      .send({ username: "onlyOauth", password: "anyguess1" });
    expect(tryLogin.status).toBe(401);
  });

  it("unlink: lockout guard refuses when it's the only sign-in method", async () => {
    planFetch({
      token: jsonOk({ access_token: "tok-1" }),
      user: jsonOk({ id: 7, login: "solo" }),
    });
    const agent = request.agent(env.app);
    const start = await agent.get("/api/auth/github/start");
    const state = stateFrom(start.headers.location);
    await agent.get(`/api/auth/github/callback?code=x&state=${state}`);
    await agent.post("/api/auth/oauth/complete").send({ username: "solo" });

    const csrf = await agent.get("/api/auth/csrf");
    const unl = await agent
      .post("/api/auth/github/unlink")
      .set("X-CSRF-Token", csrf.body.token);
    expect(unl.status).toBe(409);
  });

  it("unlink: works when the account also has a password (after manual link)", async () => {
    const agent = request.agent(env.app);
    await agent
      .post("/api/auth/register")
      .send({ username: "carol", password: "longpassword1" });

    planFetch({
      token: jsonOk({ access_token: "tok-1" }),
      user: jsonOk({ id: 21, login: "carol-on-gh" }),
    });
    const link = await agent.get("/api/auth/github/link/start");
    const state = stateFrom(link.headers.location);
    await agent.get(`/api/auth/github/callback?code=x&state=${state}`);

    const csrf = await agent.get("/api/auth/csrf");
    const unl = await agent
      .post("/api/auth/github/unlink")
      .set("X-CSRF-Token", csrf.body.token);
    expect(unl.status).toBe(204);

    const me = await agent.get("/api/auth/me");
    expect(me.body.linkedProviders).toEqual([]);
  });

  it("google branch: callback uses sub + email-prefix for suggested username", async () => {
    planFetch({
      token: jsonOk({ access_token: "tok-1" }),
      user: jsonOk({
        sub: "10000000000000000001",
        email: "jane.doe@example.com",
        name: "Jane Doe",
      }),
    });
    const { agent, state } = await startAndCaptureState(env, "google");
    const cb = await agent.get(`/api/auth/google/callback?code=x&state=${state}`);
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe("/auth/complete");

    const pending = await agent.get("/api/auth/pending");
    expect(pending.body.pending).toEqual({
      provider: "google",
      suggestedUsername: "janedoe",
    });
  });

  it("token-exchange failure redirects to /signin?err=oauth_exchange", async () => {
    planFetch({
      token: jsonStatus(500, { error: "boom" }),
      user: jsonOk({ id: 1, login: "x" }),
    });
    const { agent, state } = await startAndCaptureState(env, "github");
    const cb = await agent.get(`/api/auth/github/callback?code=x&state=${state}`);
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toContain("/signin?err=oauth_exchange");
  });
});

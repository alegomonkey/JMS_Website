import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { makeTestApp, type TestEnv } from "./helpers.js";

async function signedInAgent(env: TestEnv, username: string) {
  const agent = request.agent(env.app);
  await agent.post("/api/auth/register").send({ username, password: "longpassword1" });
  const csrf = await agent.get("/api/auth/csrf");
  return { agent, csrf: csrf.body.token as string };
}

/** Create a survey, create a session with it, and launch the session. */
async function launchedSession(
  env: TestEnv,
  agent: request.Agent,
  csrf: string,
  opts: { slotMode?: "numbered" | "named"; slotCount?: number; numTeams?: number } = {},
) {
  const { slotMode = "numbered", slotCount = 4, numTeams = 2 } = opts;

  const surveyRes = await agent
    .post("/api/surveys")
    .set("X-CSRF-Token", csrf)
    .send({ title: "Test Survey", is_public: false });
  expect(surveyRes.status).toBe(201);
  const surveyId = surveyRes.body.survey.id as number;

  const sfRes = await agent
    .post("/api/team-formations")
    .set("X-CSRF-Token", csrf)
    .send({
      title: "Test Session",
      num_teams: numTeams,
      target_team_size: 2,
      slot_mode: slotMode,
      slot_count: slotCount,
      survey_id: surveyId,
    });
  expect(sfRes.status).toBe(201);
  const sessionId = sfRes.body.session.id as number;

  const launchRes = await agent
    .post(`/api/team-formations/${sessionId}/launch`)
    .set("X-CSRF-Token", csrf);
  expect(launchRes.status).toBe(200);
  expect(launchRes.body.session.status).toBe("active");

  return { sessionId, surveyId };
}

describe("team formation routes", () => {
  let env: TestEnv;
  beforeEach(() => {
    env = makeTestApp();
  });
  afterEach(() => env.cleanup());

  // ── Session lifecycle ────────────────────────────────────────────────────

  it("creates a session and returns it with an invite_code", async () => {
    const { agent, csrf } = await signedInAgent(env, "alice");
    const res = await agent
      .post("/api/team-formations")
      .set("X-CSRF-Token", csrf)
      .send({ title: "My Session", num_teams: 2, target_team_size: 3, slot_mode: "numbered", slot_count: 6 });
    expect(res.status).toBe(201);
    expect(res.body.session.title).toBe("My Session");
    expect(typeof res.body.session.invite_code).toBe("string");
    expect(res.body.session.invite_code.length).toBeGreaterThan(0);
    expect(res.body.session.status).toBe("draft");
  });

  it("lists own sessions (empty for new user)", async () => {
    const { agent } = await signedInAgent(env, "bob");
    const res = await agent.get("/api/team-formations");
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
  });

  it("lists own sessions after creation", async () => {
    const { agent, csrf } = await signedInAgent(env, "carol");
    await agent
      .post("/api/team-formations")
      .set("X-CSRF-Token", csrf)
      .send({ title: "S1", num_teams: 2, target_team_size: 2, slot_mode: "numbered", slot_count: 4 });
    const res = await agent.get("/api/team-formations");
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].title).toBe("S1");
  });

  it("updates title and num_teams via PATCH", async () => {
    const { agent, csrf } = await signedInAgent(env, "dan");
    const create = await agent
      .post("/api/team-formations")
      .set("X-CSRF-Token", csrf)
      .send({ title: "Old", num_teams: 2, target_team_size: 2, slot_mode: "numbered", slot_count: 4 });
    const id = create.body.session.id as number;

    const res = await agent
      .patch(`/api/team-formations/${id}`)
      .set("X-CSRF-Token", csrf)
      .send({ title: "New", num_teams: 3 });
    expect(res.status).toBe(200);
    expect(res.body.session.title).toBe("New");
    expect(res.body.session.num_teams).toBe(3);
  });

  it("launches a session → status=active, 422 if no survey", async () => {
    const { agent, csrf } = await signedInAgent(env, "eve");

    const noSurvey = await agent
      .post("/api/team-formations")
      .set("X-CSRF-Token", csrf)
      .send({ title: "No Survey", num_teams: 2, target_team_size: 2, slot_mode: "numbered", slot_count: 4 });
    const badId = noSurvey.body.session.id as number;
    const badLaunch = await agent
      .post(`/api/team-formations/${badId}/launch`)
      .set("X-CSRF-Token", csrf);
    expect(badLaunch.status).toBe(422);

    const { sessionId } = await launchedSession(env, agent, csrf);
    const get = await agent.get(`/api/team-formations/${sessionId}`);
    expect(get.body.session.status).toBe("active");
  });

  it("non-owner cannot launch session", async () => {
    const { agent: a1, csrf: c1 } = await signedInAgent(env, "frank");
    const { agent: a2, csrf: c2 } = await signedInAgent(env, "grace");

    const create = await a1
      .post("/api/team-formations")
      .set("X-CSRF-Token", c1)
      .send({ title: "Owned", num_teams: 2, target_team_size: 2, slot_mode: "numbered", slot_count: 4 });
    const id = create.body.session.id as number;

    const res = await a2
      .post(`/api/team-formations/${id}/launch`)
      .set("X-CSRF-Token", c2);
    expect(res.status).toBe(403);
  });

  it("closes a session → status=closed", async () => {
    const { agent, csrf } = await signedInAgent(env, "henry");
    const { sessionId } = await launchedSession(env, agent, csrf);
    const res = await agent
      .post(`/api/team-formations/${sessionId}/close`)
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe("closed");
  });

  it("non-owner cannot close session", async () => {
    const { agent: a1, csrf: c1 } = await signedInAgent(env, "igor");
    const { agent: a2, csrf: c2 } = await signedInAgent(env, "jade");

    const { sessionId } = await launchedSession(env, a1, c1);
    const res = await a2
      .post(`/api/team-formations/${sessionId}/close`)
      .set("X-CSRF-Token", c2);
    expect(res.status).toBe(403);
  });

  it("forms teams from a closed session → teams array non-empty", async () => {
    const { agent, csrf } = await signedInAgent(env, "kate");
    const { sessionId } = await launchedSession(env, agent, csrf, { slotCount: 4, numTeams: 2 });

    // Submit two responses so the algorithm has data
    for (let i = 0; i < 2; i++) {
      const p = request.agent(env.app);
      const slotRes = await p.post(`/api/team-formations/${sessionId}/reserve-slot`);
      await p.post(`/api/team-formations/${sessionId}/responses`).send({
        slot_number: slotRes.body.slot_number,
        answers: {},
      });
    }

    await agent.post(`/api/team-formations/${sessionId}/close`).set("X-CSRF-Token", csrf);

    const res = await agent
      .post(`/api/team-formations/${sessionId}/form-teams`)
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.teams)).toBe(true);
    expect(res.body.teams.length).toBeGreaterThan(0);
  });

  it("can re-form teams from a formed session", async () => {
    const { agent, csrf } = await signedInAgent(env, "liam");
    const { sessionId } = await launchedSession(env, agent, csrf, { slotCount: 4, numTeams: 2 });

    // Submit one response
    const p = request.agent(env.app);
    const slotRes = await p.post(`/api/team-formations/${sessionId}/reserve-slot`);
    await p.post(`/api/team-formations/${sessionId}/responses`).send({
      slot_number: slotRes.body.slot_number,
      answers: {},
    });

    await agent.post(`/api/team-formations/${sessionId}/close`).set("X-CSRF-Token", csrf);
    await agent.post(`/api/team-formations/${sessionId}/form-teams`).set("X-CSRF-Token", csrf);

    // Second form-teams should also succeed (status is now 'formed')
    const res = await agent
      .post(`/api/team-formations/${sessionId}/form-teams`)
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(200);
  });

  // ── State machine rejections ─────────────────────────────────────────────

  it("cannot close a draft session", async () => {
    const { agent, csrf } = await signedInAgent(env, "mia");
    const create = await agent
      .post("/api/team-formations")
      .set("X-CSRF-Token", csrf)
      .send({ title: "Draft", num_teams: 2, target_team_size: 2, slot_mode: "numbered", slot_count: 4 });
    const id = create.body.session.id as number;
    const res = await agent
      .post(`/api/team-formations/${id}/close`)
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(422);
  });

  it("cannot form teams from an active session", async () => {
    const { agent, csrf } = await signedInAgent(env, "noah");
    const { sessionId } = await launchedSession(env, agent, csrf);
    const res = await agent
      .post(`/api/team-formations/${sessionId}/form-teams`)
      .set("X-CSRF-Token", csrf);
    expect(res.status).toBe(422);
  });

  // ── Slot reservation (numbered mode) ────────────────────────────────────

  it("reserves a slot and submits a response", async () => {
    const { agent, csrf } = await signedInAgent(env, "olivia");
    const { sessionId } = await launchedSession(env, agent, csrf, { slotCount: 2, numTeams: 2 });

    // Use a separate agent to simulate a participant (shares cookies automatically)
    const participant = request.agent(env.app);
    const slotRes = await participant.post(`/api/team-formations/${sessionId}/reserve-slot`);
    expect(slotRes.status).toBe(200);
    const slotNumber = slotRes.body.slot_number as number;
    expect(slotNumber).toBeGreaterThan(0);

    const submitRes = await participant
      .post(`/api/team-formations/${sessionId}/responses`)
      .send({ slot_number: slotNumber, answers: {} });
    expect(submitRes.status).toBe(201);
    expect(typeof submitRes.body.response_id).toBe("number");

    // slots_submitted should increment
    const get = await agent.get(`/api/team-formations/${sessionId}`);
    expect(get.body.session.slots_submitted).toBe(1);
  });

  it("reserve-slot is idempotent (same session token returns same slot)", async () => {
    const { agent, csrf } = await signedInAgent(env, "peter");
    const { sessionId } = await launchedSession(env, agent, csrf);

    const participant = request.agent(env.app);
    const r1 = await participant.post(`/api/team-formations/${sessionId}/reserve-slot`);
    const r2 = await participant.post(`/api/team-formations/${sessionId}/reserve-slot`);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.slot_number).toBe(r2.body.slot_number);
  });

  it("auto-closes session when slots_submitted reaches slot_count", async () => {
    const { agent, csrf } = await signedInAgent(env, "quinn");
    const { sessionId } = await launchedSession(env, agent, csrf, { slotCount: 2, numTeams: 2 });

    // Submit from two separate participants
    for (let i = 0; i < 2; i++) {
      const p = request.agent(env.app);
      const slotRes = await p.post(`/api/team-formations/${sessionId}/reserve-slot`);
      await p.post(`/api/team-formations/${sessionId}/responses`).send({
        slot_number: slotRes.body.slot_number,
        answers: {},
      });
    }

    const get = await agent.get(`/api/team-formations/${sessionId}`);
    expect(get.body.session.status).toBe("closed");
  });

  // ── Named mode ───────────────────────────────────────────────────────────

  it("allows duplicate responses for the same alias_id (named mode)", async () => {
    const { agent, csrf } = await signedInAgent(env, "rita");

    // Create survey first
    const surveyRes = await agent
      .post("/api/surveys")
      .set("X-CSRF-Token", csrf)
      .send({ title: "Named Survey", is_public: false });
    const surveyId = surveyRes.body.survey.id as number;

    // Create session in draft
    const sfRes = await agent
      .post("/api/team-formations")
      .set("X-CSRF-Token", csrf)
      .send({
        title: "Named Session",
        num_teams: 2,
        target_team_size: 2,
        slot_mode: "named",
        slot_count: 4,
        survey_id: surveyId,
      });
    const sessionId = sfRes.body.session.id as number;

    // Add aliases while in draft
    const aliasRes = await agent
      .post(`/api/team-formations/${sessionId}/aliases`)
      .set("X-CSRF-Token", csrf)
      .send({ display_name: "Alice" });
    expect(aliasRes.status).toBe(201);
    const aliasId = aliasRes.body.alias.id as number;

    // Launch
    await agent.post(`/api/team-formations/${sessionId}/launch`).set("X-CSRF-Token", csrf);

    const r1 = await request(env.app)
      .post(`/api/team-formations/${sessionId}/responses`)
      .send({ alias_id: aliasId, answers: {} });
    const r2 = await request(env.app)
      .post(`/api/team-formations/${sessionId}/responses`)
      .send({ alias_id: aliasId, answers: {} });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
  });

  // ── Aggregate + export ───────────────────────────────────────────────────

  it("aggregate returns 200 after launch", async () => {
    const { agent, csrf } = await signedInAgent(env, "sam");
    const { sessionId } = await launchedSession(env, agent, csrf);
    const res = await agent.get(`/api/team-formations/${sessionId}/aggregate`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.aggregate)).toBe(true);
  });

  it("export returns CSV with Team Name header", async () => {
    const { agent, csrf } = await signedInAgent(env, "tara");
    const { sessionId } = await launchedSession(env, agent, csrf);
    await agent.post(`/api/team-formations/${sessionId}/close`).set("X-CSRF-Token", csrf);
    await agent.post(`/api/team-formations/${sessionId}/form-teams`).set("X-CSRF-Token", csrf);

    const res = await agent.get(`/api/team-formations/${sessionId}/export`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Team Name");
  });

  // ── Validate-code ────────────────────────────────────────────────────────

  it("validate-code returns session for valid active code", async () => {
    const { agent, csrf } = await signedInAgent(env, "uma");
    const { sessionId } = await launchedSession(env, agent, csrf);
    const get = await agent.get(`/api/team-formations/${sessionId}`);
    const code = get.body.session.invite_code as string;

    const res = await request(env.app)
      .post("/api/team-formations/validate-code")
      .send({ code });
    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(sessionId);
  });

  it("validate-code returns 404 for invalid code", async () => {
    const res = await request(env.app)
      .post("/api/team-formations/validate-code")
      .send({ code: "BADCODE123" });
    expect(res.status).toBe(404);
  });

  // ── Exclude + move (post-formation) ─────────────────────────────────────

  it("excludes a response and renames + moves a team member", async () => {
    const { agent, csrf } = await signedInAgent(env, "vera");
    const { sessionId } = await launchedSession(env, agent, csrf, { slotCount: 4, numTeams: 2 });

    // Submit two responses
    const participants: number[] = [];
    for (let i = 0; i < 2; i++) {
      const p = request.agent(env.app);
      const slotRes = await p.post(`/api/team-formations/${sessionId}/reserve-slot`);
      const submitRes = await p
        .post(`/api/team-formations/${sessionId}/responses`)
        .send({ slot_number: slotRes.body.slot_number, answers: {} });
      participants.push(submitRes.body.response_id as number);
    }

    // Close and form teams
    await agent.post(`/api/team-formations/${sessionId}/close`).set("X-CSRF-Token", csrf);
    const formRes = await agent
      .post(`/api/team-formations/${sessionId}/form-teams`)
      .set("X-CSRF-Token", csrf);
    const teams = formRes.body.teams as { id: number }[];
    expect(teams.length).toBeGreaterThan(0);

    const teamId = teams[0]!.id;
    const responseId = participants[0]!;

    // Exclude a response
    const excludeRes = await agent
      .patch(`/api/team-formations/${sessionId}/responses/${responseId}`)
      .set("X-CSRF-Token", csrf)
      .send({ is_excluded: true });
    expect(excludeRes.status).toBe(204);

    // Rename a team
    const renameRes = await agent
      .patch(`/api/team-formations/${sessionId}/teams/${teamId}`)
      .set("X-CSRF-Token", csrf)
      .send({ name: "Red Team" });
    expect(renameRes.status).toBe(200);
    expect(renameRes.body.team.name).toBe("Red Team");

    // Move a member (if two teams exist)
    if (teams.length >= 2) {
      const targetTeamId = teams[1]!.id;
      const moveRes = await agent
        .put(`/api/team-formations/${sessionId}/teams/${targetTeamId}/members/${responseId}`)
        .set("X-CSRF-Token", csrf);
      expect(moveRes.status).toBe(204);
    }
  });

  // ── Non-owner access ─────────────────────────────────────────────────────

  it("non-owner gets 403 when fetching another user's session", async () => {
    const { agent: a1, csrf: c1 } = await signedInAgent(env, "will");
    const { agent: a2 } = await signedInAgent(env, "xena");

    const create = await a1
      .post("/api/team-formations")
      .set("X-CSRF-Token", c1)
      .send({ title: "Private", num_teams: 2, target_team_size: 2, slot_mode: "numbered", slot_count: 4 });
    const id = create.body.session.id as number;

    const res = await a2.get(`/api/team-formations/${id}`);
    expect(res.status).toBe(403);
  });
});

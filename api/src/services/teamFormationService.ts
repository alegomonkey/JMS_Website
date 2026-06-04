import { randomBytes } from "node:crypto";
import type { DB } from "../db.js";
import { httpError } from "../middleware/errorHandler.js";
import { getSurveyWithQuestions } from "./surveyService.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type SlotMode = "numbered" | "named";
export type SessionStatus = "draft" | "active" | "closed" | "formed";

export interface TeamFormation {
  id: number;
  manager_id: number;
  title: string;
  description: string | null;
  num_teams: number;
  target_team_size: number;
  survey_id: number | null;
  invite_code: string;
  slot_mode: SlotMode;
  slot_count: number;
  slots_submitted: number;
  status: SessionStatus;
  closes_at: number | null;
  rng_seed: number | null;
  formed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface TfRow extends TeamFormation {
  survey_snapshot: string | null;
}

export interface Alias {
  id: number;
  team_formation_id: number;
  display_name: string;
  sort_order: number;
  created_at: number;
}

interface ResponseRow {
  id: number;
  slot_number: number | null;
  alias_id: number | null;
  display_name: string | null;
  answers: string;
  submitted_at: number;
  is_excluded: number;
}

export interface TeamResult {
  id: number;
  name: string;
  sort_order: number;
  member_count: number;
}

export interface TeamMember {
  response_id: number;
  submission_label: string;
}

export interface PaginatedMembers {
  members: TeamMember[];
  total: number;
  page: number;
  pageSize: number;
}

export interface QuestionAggregate {
  question_id: number;
  block_type: string;
  prompt: string;
  response_count: number;
  data: unknown;
}

export interface FormTeamsResult {
  teams: { id: number; name: string; sort_order: number }[];
  excluded_responses: number[];
  warnings: string[];
}

// Parsed snapshot structure
interface SnapshotQuestion {
  id: number;
  sort_order: number;
  block_type: string;
  prompt: string;
  config: Record<string, unknown>;
}

interface Snapshot {
  survey: { id: number; title: string; description: string | null; tags: string[] };
  questions: SnapshotQuestion[];
}

// ── Internal helpers ───────────────────────────────────────────────────────

const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(db: DB): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = randomBytes(10);
    const code = Array.from(bytes)
      .map((b) => INVITE_CHARS[b % INVITE_CHARS.length])
      .join("");
    const exists = db
      .prepare("SELECT 1 FROM team_formations WHERE invite_code = ?")
      .get(code);
    if (!exists) return code;
  }
  throw new Error("invite code generation failed after 10 attempts");
}

function assertStatus(session: TfRow, ...allowed: SessionStatus[]): void {
  if (!allowed.includes(session.status)) {
    throw httpError(
      422,
      `action not allowed in status '${session.status}'`,
    );
  }
}

function assertOwner(session: TfRow, managerId: number): void {
  if (session.manager_id !== managerId) throw httpError(403, "forbidden");
}

function getSessionRow(db: DB, id: number): TfRow | null {
  const row = db
    .prepare("SELECT * FROM team_formations WHERE id = ?")
    .get(id) as TfRow | undefined;
  return row ?? null;
}

function stripSnapshot(row: TfRow): TeamFormation {
  const { survey_snapshot: _snap, ...rest } = row;
  void _snap;
  return rest;
}

// ── Deterministic PRNG (Mulberry32 + FNV-1a) ──────────────────────────────

export function fnv1a32(n: number): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < 4; i++) {
    hash ^= (n >>> (i * 8)) & 0xff;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

// ── Algorithm helpers ──────────────────────────────────────────────────────

function buildVectors(
  responses: ResponseRow[],
  questions: SnapshotQuestion[],
): Map<number, number[]> {
  const dims: { questionId: number; key: string; type: string }[] = [];

  for (const q of questions) {
    if (q.block_type === "skill_level") {
      const cfg = q.config as { parent_question_id: number };
      const parentQ = questions.find((pq) => pq.id === cfg.parent_question_id);
      if (parentQ) {
        const cats = ((parentQ.config as { categories?: string[] }).categories ?? []);
        for (const cat of cats) dims.push({ questionId: q.id, key: cat, type: "skill_level" });
      }
    } else if (q.block_type === "custom_scale") {
      dims.push({ questionId: q.id, key: "__value__", type: "custom_scale" });
    } else if (q.block_type === "multiple_choice") {
      const opts = ((q.config as { options?: string[] }).options ?? []);
      for (const opt of opts) dims.push({ questionId: q.id, key: opt, type: "multiple_choice" });
    }
  }

  const vectors = new Map<number, number[]>();
  for (const r of responses) {
    const answers = JSON.parse(r.answers) as Record<string, unknown>;
    const vec = dims.map(({ questionId, key, type }) => {
      const a = answers[String(questionId)];
      if (a === undefined || a === null) return 0;
      if (type === "skill_level") {
        const scores = a as Record<string, number>;
        return typeof scores[key] === "number" ? scores[key] : 0;
      }
      if (type === "custom_scale") return typeof a === "number" ? a : 0;
      if (type === "multiple_choice") {
        return Array.isArray(a) && (a as string[]).includes(key) ? 1 : 0;
      }
      return 0;
    });
    vectors.set(r.id, vec);
  }
  return vectors;
}

function canonicalPairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

interface AvoidPairs {
  hardPairs: Set<string>;
  softPairs: Set<string>;
}

function buildAvoidPairs(
  responses: ResponseRow[],
  questions: SnapshotQuestion[],
): AvoidPairs {
  const hardPairs = new Set<string>();
  const softPairs = new Set<string>();

  const avoidQ = questions.find((q) => q.block_type === "avoid_respondent");
  if (!avoidQ) return { hardPairs, softPairs };

  // Map display_name → response id
  const nameToId = new Map<string, number>();
  for (const r of responses) {
    if (r.display_name) nameToId.set(r.display_name, r.id);
  }

  // Build raw directional avoid set first
  const directional = new Set<string>(); // "avoiderId-avoideeId"
  for (const r of responses) {
    const answers = JSON.parse(r.answers) as Record<string, unknown>;
    const avoided = answers[String(avoidQ.id)];
    if (!Array.isArray(avoided)) continue;
    for (const name of avoided as string[]) {
      const targetId = nameToId.get(name);
      if (targetId !== undefined && targetId !== r.id) {
        directional.add(`${r.id}-${targetId}`);
      }
    }
  }

  // Classify as hard (mutual) or soft (one-way)
  for (const key of directional) {
    const [aStr, bStr] = key.split("-") as [string, string];
    const a = Number(aStr);
    const b = Number(bStr);
    const reverse = `${b}-${a}`;
    if (directional.has(reverse)) {
      hardPairs.add(canonicalPairKey(a, b));
    } else {
      softPairs.add(key);
    }
  }

  return { hardPairs, softPairs };
}

function countHardViolations(assignment: number[][], hardPairs: Set<string>): number {
  let count = 0;
  for (const team of assignment) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        if (hardPairs.has(canonicalPairKey(team[i]!, team[j]!))) count++;
      }
    }
  }
  return count;
}

function teamContainsViolation(team: number[], newMember: number, hardPairs: Set<string>): boolean {
  return team.some((m) => hardPairs.has(canonicalPairKey(m, newMember)));
}

function fixHardConstraints(
  assignment: number[][],
  hardPairs: Set<string>,
): number[][] {
  const result = assignment.map((t) => [...t]);
  for (let attempt = 0; attempt < 200; attempt++) {
    let swapped = false;
    outer: for (let ti = 0; ti < result.length; ti++) {
      for (let i = 0; i < result[ti]!.length; i++) {
        const a = result[ti]![i]!;
        for (let j = i + 1; j < result[ti]!.length; j++) {
          const b = result[ti]![j]!;
          if (!hardPairs.has(canonicalPairKey(a, b))) continue;
          // Try swapping a into another team
          for (let tk = 0; tk < result.length; tk++) {
            if (tk === ti) continue;
            for (let k = 0; k < result[tk]!.length; k++) {
              const c = result[tk]![k]!;
              const tiWithout = result[ti]!.filter((_, idx) => idx !== i);
              const tkWithout = result[tk]!.filter((_, idx) => idx !== k);
              if (
                !teamContainsViolation(tiWithout, c, hardPairs) &&
                !teamContainsViolation(tkWithout, a, hardPairs)
              ) {
                result[ti]![i] = c;
                result[tk]![k] = a;
                swapped = true;
                break outer;
              }
            }
          }
        }
      }
    }
    if (!swapped) break;
  }
  return result;
}

function computeScore(
  assignment: number[][],
  vectors: Map<number, number[]>,
  softPairs: Set<string>,
): number {
  const dim = vectors.values().next().value?.length ?? 0;
  if (dim === 0) return 0;

  const teamMeans = assignment.map((team) => {
    const mean = new Array<number>(dim).fill(0);
    for (const id of team) {
      const v = vectors.get(id);
      if (v) for (let d = 0; d < dim; d++) mean[d]! += v[d]!;
    }
    if (team.length > 0) for (let d = 0; d < dim; d++) mean[d]! /= team.length;
    return mean;
  });

  let totalVariance = 0;
  for (let d = 0; d < dim; d++) {
    const vals = teamMeans.map((m) => m[d]!);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    totalVariance += vals.reduce((a, v) => a + (v - avg) ** 2, 0) / vals.length;
  }

  let softPenalty = 0;
  for (const team of assignment) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        const a = team[i]!;
        const b = team[j]!;
        if (softPairs.has(`${a}-${b}`) || softPairs.has(`${b}-${a}`)) softPenalty += 1;
      }
    }
  }

  return -(totalVariance + softPenalty * 0.1);
}

// ── Session CRUD ───────────────────────────────────────────────────────────

export function createSession(
  db: DB,
  managerId: number,
  fields: {
    title: string;
    description?: string | null;
    num_teams: number;
    target_team_size: number;
    slot_mode: SlotMode;
    slot_count: number;
    survey_id?: number | null;
    closes_at?: number | null;
  },
): TeamFormation {
  const inviteCode = generateInviteCode(db);
  const info = db
    .prepare(
      `INSERT INTO team_formations
         (manager_id, title, description, num_teams, target_team_size,
          slot_mode, slot_count, survey_id, closes_at, invite_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      managerId,
      fields.title,
      fields.description ?? null,
      fields.num_teams,
      fields.target_team_size,
      fields.slot_mode,
      fields.slot_count,
      fields.survey_id ?? null,
      fields.closes_at ?? null,
      inviteCode,
    );
  return stripSnapshot(getSessionRow(db, Number(info.lastInsertRowid)) as TfRow);
}

export function getSessions(db: DB, managerId: number): TeamFormation[] {
  return (
    db
      .prepare(
        "SELECT * FROM team_formations WHERE manager_id = ? ORDER BY created_at DESC",
      )
      .all(managerId) as TfRow[]
  ).map(stripSnapshot);
}

export function getSession(db: DB, id: number): TeamFormation | null {
  const row = getSessionRow(db, id);
  return row ? stripSnapshot(row) : null;
}

export function updateSession(
  db: DB,
  id: number,
  managerId: number,
  patch: {
    title?: string;
    description?: string | null;
    num_teams?: number;
    target_team_size?: number;
    slot_mode?: SlotMode;
    slot_count?: number;
    survey_id?: number | null;
    closes_at?: number | null;
  },
): TeamFormation {
  const session = getSessionRow(db, id);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);
  assertStatus(session, "draft");

  const sets: string[] = ["updated_at = unixepoch()"];
  const params: unknown[] = [];

  const add = (col: string, val: unknown): void => {
    sets.push(`${col} = ?`);
    params.push(val);
  };

  if (patch.title !== undefined) add("title", patch.title);
  if (patch.description !== undefined) add("description", patch.description);
  if (patch.num_teams !== undefined) add("num_teams", patch.num_teams);
  if (patch.target_team_size !== undefined) add("target_team_size", patch.target_team_size);
  if (patch.slot_mode !== undefined) add("slot_mode", patch.slot_mode);
  if (patch.slot_count !== undefined) add("slot_count", patch.slot_count);
  if (patch.survey_id !== undefined) add("survey_id", patch.survey_id);
  if (patch.closes_at !== undefined) add("closes_at", patch.closes_at);

  params.push(id);
  db.prepare(`UPDATE team_formations SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  return stripSnapshot(getSessionRow(db, id) as TfRow);
}

export function launchSession(db: DB, id: number, managerId: number): TeamFormation {
  const session = getSessionRow(db, id);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);
  assertStatus(session, "draft");

  if (!session.survey_id) throw httpError(422, "a survey must be attached before launching");
  const surveyData = getSurveyWithQuestions(db, session.survey_id);
  if (!surveyData) throw httpError(422, "attached survey not found");

  const snapshot: Snapshot = {
    survey: {
      id: surveyData.survey.id,
      title: surveyData.survey.title,
      description: surveyData.survey.description,
      tags: JSON.parse(surveyData.survey.tags) as string[],
    },
    questions: surveyData.questions.map((q) => ({
      id: q.id,
      sort_order: q.sort_order,
      block_type: q.block_type,
      prompt: q.prompt,
      config: JSON.parse(q.config) as Record<string, unknown>,
    })),
  };

  db.prepare(
    `UPDATE team_formations
     SET status = 'active', survey_snapshot = ?, updated_at = unixepoch()
     WHERE id = ?`,
  ).run(JSON.stringify(snapshot), id);

  return stripSnapshot(getSessionRow(db, id) as TfRow);
}

export function closeSession(db: DB, id: number, managerId: number): TeamFormation {
  const session = getSessionRow(db, id);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);
  assertStatus(session, "active");
  db.prepare(
    "UPDATE team_formations SET status = 'closed', updated_at = unixepoch() WHERE id = ?",
  ).run(id);
  return stripSnapshot(getSessionRow(db, id) as TfRow);
}

export function lazyCloseCheck(db: DB, id: number): void {
  db.prepare(
    `UPDATE team_formations SET status = 'closed', updated_at = unixepoch()
     WHERE id = ? AND status = 'active'
       AND closes_at IS NOT NULL AND closes_at < unixepoch()`,
  ).run(id);
}

export function getParticipantSnapshot(
  db: DB,
  sessionId: number,
): { survey: Snapshot["survey"]; questions: SnapshotQuestion[] } | null {
  const row = db
    .prepare("SELECT status, survey_snapshot FROM team_formations WHERE id = ?")
    .get(sessionId) as { status: string; survey_snapshot: string | null } | undefined;
  if (!row || row.status !== "active" || !row.survey_snapshot) return null;
  const snap = JSON.parse(row.survey_snapshot) as Snapshot;
  return snap;
}

export function validateInviteCode(db: DB, code: string): TeamFormation | null {
  const row = db
    .prepare(
      "SELECT * FROM team_formations WHERE invite_code = ? AND status = 'active'",
    )
    .get(code) as TfRow | undefined;
  return row ? stripSnapshot(row) : null;
}

// ── Slot reservation ───────────────────────────────────────────────────────

export function reserveSlot(
  db: DB,
  sessionId: number,
  sessionToken: string,
): number {
  const reserve = db.transaction((): number => {
    db.prepare(
      "DELETE FROM slot_reservations WHERE team_formation_id = ? AND expires_at < unixepoch()",
    ).run(sessionId);

    // Idempotent: return existing slot for this session token if present.
    const existing = db
      .prepare(
        "SELECT slot_number FROM slot_reservations WHERE team_formation_id = ? AND session_token = ?",
      )
      .get(sessionId, sessionToken) as { slot_number: number } | undefined;
    if (existing) return existing.slot_number;

    const tf = db
      .prepare("SELECT slot_count, slots_submitted, status FROM team_formations WHERE id = ?")
      .get(sessionId) as { slot_count: number; slots_submitted: number; status: string } | undefined;
    if (!tf) throw httpError(404, "session not found");
    if (tf.status !== "active") throw httpError(409, "session is not accepting submissions");

    const { n: activeReservations } = db
      .prepare("SELECT COUNT(*) as n FROM slot_reservations WHERE team_formation_id = ?")
      .get(sessionId) as { n: number };

    if (tf.slots_submitted + activeReservations >= tf.slot_count) {
      throw httpError(409, "session is full");
    }

    const taken = new Set<number>();
    (
      db
        .prepare(
          "SELECT slot_number FROM survey_responses WHERE team_formation_id = ? AND slot_number IS NOT NULL",
        )
        .all(sessionId) as { slot_number: number }[]
    ).forEach((r) => taken.add(r.slot_number));
    (
      db
        .prepare("SELECT slot_number FROM slot_reservations WHERE team_formation_id = ?")
        .all(sessionId) as { slot_number: number }[]
    ).forEach((r) => taken.add(r.slot_number));

    let slotNumber = -1;
    for (let i = 1; i <= tf.slot_count; i++) {
      if (!taken.has(i)) { slotNumber = i; break; }
    }
    if (slotNumber === -1) throw httpError(409, "session is full");

    db.prepare(
      `INSERT INTO slot_reservations (team_formation_id, slot_number, session_token, expires_at)
       VALUES (?, ?, ?, unixepoch() + 1800)`,
    ).run(sessionId, slotNumber, sessionToken);

    return slotNumber;
  });

  return reserve();
}

export function submitResponse(
  db: DB,
  sessionId: number,
  payload:
    | { mode: "numbered"; slotNumber: number; sessionToken: string; answers: Record<string, unknown> }
    | { mode: "named"; aliasId: number; answers: Record<string, unknown> },
): number {
  const submit = db.transaction((): number => {
    const tf = db
      .prepare("SELECT slot_count, slots_submitted, slot_mode, status FROM team_formations WHERE id = ?")
      .get(sessionId) as
      | { slot_count: number; slots_submitted: number; slot_mode: string; status: string }
      | undefined;
    if (!tf) throw httpError(404, "session not found");
    if (tf.status !== "active") throw httpError(409, "session is not accepting submissions");

    const answersJson = JSON.stringify(payload.answers);
    let responseId: number;

    if (payload.mode === "numbered") {
      if (tf.slot_mode !== "numbered") throw httpError(400, "session uses named mode");
      const reservation = db
        .prepare(
          `SELECT slot_number FROM slot_reservations
           WHERE team_formation_id = ? AND slot_number = ? AND session_token = ?`,
        )
        .get(sessionId, payload.slotNumber, payload.sessionToken) as
        | { slot_number: number }
        | undefined;
      if (!reservation) throw httpError(400, "slot reservation not found or expired");

      db.prepare(
        "DELETE FROM slot_reservations WHERE team_formation_id = ? AND slot_number = ?",
      ).run(sessionId, payload.slotNumber);

      const info = db
        .prepare(
          "INSERT INTO survey_responses (team_formation_id, slot_number, answers) VALUES (?, ?, ?)",
        )
        .run(sessionId, payload.slotNumber, answersJson);
      responseId = Number(info.lastInsertRowid);
    } else {
      if (tf.slot_mode !== "named") throw httpError(400, "session uses numbered mode");
      const alias = db
        .prepare(
          "SELECT id FROM team_formation_aliases WHERE id = ? AND team_formation_id = ?",
        )
        .get(payload.aliasId, sessionId);
      if (!alias) throw httpError(400, "alias not found in this session");

      const info = db
        .prepare(
          "INSERT INTO survey_responses (team_formation_id, alias_id, answers) VALUES (?, ?, ?)",
        )
        .run(sessionId, payload.aliasId, answersJson);
      responseId = Number(info.lastInsertRowid);
    }

    db.prepare(
      "UPDATE team_formations SET slots_submitted = slots_submitted + 1, updated_at = unixepoch() WHERE id = ?",
    ).run(sessionId);

    if (payload.mode === "numbered") {
      const updated = db
        .prepare("SELECT slots_submitted, slot_count FROM team_formations WHERE id = ?")
        .get(sessionId) as { slots_submitted: number; slot_count: number };
      if (updated.slots_submitted >= updated.slot_count) {
        db.prepare(
          "UPDATE team_formations SET status = 'closed', updated_at = unixepoch() WHERE id = ? AND status = 'active'",
        ).run(sessionId);
      }
    }

    return responseId;
  });

  return submit();
}

// ── Aliases (named mode) ───────────────────────────────────────────────────

export function getAliases(db: DB, sessionId: number, managerId: number): Alias[] {
  const session = getSessionRow(db, sessionId);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);
  return db
    .prepare(
      "SELECT * FROM team_formation_aliases WHERE team_formation_id = ? ORDER BY sort_order",
    )
    .all(sessionId) as Alias[];
}

export function addAlias(
  db: DB,
  sessionId: number,
  managerId: number,
  displayName: string,
  sortOrder?: number,
): Alias {
  const session = getSessionRow(db, sessionId);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);
  assertStatus(session, "draft");

  try {
    const nextOrder = sortOrder ?? (() => {
      const row = db
        .prepare("SELECT MAX(sort_order) as m FROM team_formation_aliases WHERE team_formation_id = ?")
        .get(sessionId) as { m: number | null };
      return (row.m ?? -1) + 1;
    })();

    const info = db
      .prepare(
        `INSERT INTO team_formation_aliases (team_formation_id, display_name, sort_order)
         VALUES (?, ?, ?)`,
      )
      .run(sessionId, displayName, nextOrder);

    return db
      .prepare("SELECT * FROM team_formation_aliases WHERE id = ?")
      .get(Number(info.lastInsertRowid)) as Alias;
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      throw httpError(409, "alias name already exists in this session");
    }
    throw err;
  }
}

export function removeAlias(
  db: DB,
  sessionId: number,
  managerId: number,
  aliasId: number,
): void {
  const session = getSessionRow(db, sessionId);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);
  assertStatus(session, "draft");

  const alias = db
    .prepare("SELECT id FROM team_formation_aliases WHERE id = ? AND team_formation_id = ?")
    .get(aliasId, sessionId);
  if (!alias) throw httpError(404, "alias not found");
  db.prepare("DELETE FROM team_formation_aliases WHERE id = ?").run(aliasId);
}

// ── Team formation algorithm ───────────────────────────────────────────────

export function formTeams(db: DB, sessionId: number, managerId: number): FormTeamsResult {
  const session = getSessionRow(db, sessionId);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);
  assertStatus(session, "closed", "formed");

  let seed = session.rng_seed;
  if (seed === null) {
    seed = fnv1a32(sessionId);
    db.prepare("UPDATE team_formations SET rng_seed = ? WHERE id = ?").run(seed, sessionId);
  }

  const allResponses = db
    .prepare(
      `SELECT sr.id, sr.slot_number, sr.alias_id, sr.answers, sr.submitted_at,
              sr.is_excluded, tfa.display_name
       FROM survey_responses sr
       LEFT JOIN team_formation_aliases tfa ON tfa.id = sr.alias_id
       WHERE sr.team_formation_id = ? AND sr.is_excluded = 0
       ORDER BY sr.submitted_at ASC`,
    )
    .all(sessionId) as ResponseRow[];

  const excludedResponses: number[] = [];
  let responses: ResponseRow[];

  if (session.slot_mode === "named") {
    const seen = new Map<number, boolean>();
    responses = [];
    for (const r of allResponses) {
      if (r.alias_id === null) {
        responses.push(r);
      } else if (!seen.has(r.alias_id)) {
        seen.set(r.alias_id, true);
        responses.push(r);
      } else {
        excludedResponses.push(r.id);
      }
    }
  } else {
    responses = allResponses;
  }

  if (responses.length === 0) throw httpError(422, "no responses to form teams from");

  const snapshot = session.survey_snapshot
    ? (JSON.parse(session.survey_snapshot) as Snapshot)
    : { survey: { id: 0, title: "", description: null, tags: [] }, questions: [] };

  const questions = snapshot.questions;
  const vectors = buildVectors(responses, questions);
  const { hardPairs, softPairs } = buildAvoidPairs(responses, questions);

  const numTeams = session.num_teams;
  const responseIds = responses.map((r) => r.id);

  let bestAssignment: number[][] | null = null;
  let bestScore = -Infinity;
  let bestViolations = Infinity;

  for (let restart = 0; restart < 1000; restart++) {
    const rand = mulberry32(((seed + restart) >>> 0));
    const shuffled = [...responseIds];
    shuffleInPlace(shuffled, rand);

    const assignment: number[][] = Array.from({ length: numTeams }, () => []);
    for (let i = 0; i < shuffled.length; i++) {
      assignment[i % numTeams]!.push(shuffled[i]!);
    }

    const fixed = fixHardConstraints(assignment, hardPairs);
    const violations = countHardViolations(fixed, hardPairs);
    const score = computeScore(fixed, vectors, softPairs);

    if (
      violations < bestViolations ||
      (violations === bestViolations && score > bestScore)
    ) {
      bestViolations = violations;
      bestScore = score;
      bestAssignment = fixed;
    }
  }

  const warnings: string[] = [];
  if (bestViolations > 0) {
    warnings.push(
      `${bestViolations} hard constraint violation(s) could not be resolved — some participants share a team with a requested avoidee.`,
    );
  }

  const write = db.transaction(() => {
    db.prepare("DELETE FROM teams WHERE team_formation_id = ?").run(sessionId);

    const insertTeam = db.prepare(
      "INSERT INTO teams (team_formation_id, name, sort_order) VALUES (?, ?, ?)",
    );
    const insertMember = db.prepare(
      "INSERT INTO team_members (team_id, response_id) VALUES (?, ?)",
    );

    const teamRows: { id: number; name: string; sort_order: number }[] = [];
    (bestAssignment ?? []).forEach((members, idx) => {
      const info = insertTeam.run(sessionId, `Team ${idx + 1}`, idx);
      const teamId = Number(info.lastInsertRowid);
      teamRows.push({ id: teamId, name: `Team ${idx + 1}`, sort_order: idx });
      for (const rid of members) insertMember.run(teamId, rid);
    });

    db.prepare(
      `UPDATE team_formations
       SET status = 'formed', formed_at = unixepoch(), updated_at = unixepoch()
       WHERE id = ?`,
    ).run(sessionId);

    return teamRows;
  });

  const teams = write();
  return { teams, excluded_responses: excludedResponses, warnings };
}

// ── Results & export ───────────────────────────────────────────────────────

export function getResults(db: DB, sessionId: number, managerId: number): TeamResult[] {
  const session = getSessionRow(db, sessionId);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);

  return db
    .prepare(
      `SELECT t.id, t.name, t.sort_order,
              COUNT(tm.id) as member_count
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id
       WHERE t.team_formation_id = ?
       GROUP BY t.id
       ORDER BY t.sort_order`,
    )
    .all(sessionId) as TeamResult[];
}

export function getTeamMembers(
  db: DB,
  sessionId: number,
  managerId: number,
  teamId: number,
  page: number,
  pageSize: number,
): PaginatedMembers {
  const session = getSessionRow(db, sessionId);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);

  const team = db
    .prepare("SELECT id FROM teams WHERE id = ? AND team_formation_id = ?")
    .get(teamId, sessionId);
  if (!team) throw httpError(404, "team not found");

  const { total } = db
    .prepare("SELECT COUNT(*) as total FROM team_members WHERE team_id = ?")
    .get(teamId) as { total: number };

  const offset = (page - 1) * pageSize;
  const rows = db
    .prepare(
      `SELECT tm.response_id, sr.slot_number, tfa.display_name
       FROM team_members tm
       JOIN survey_responses sr ON sr.id = tm.response_id
       LEFT JOIN team_formation_aliases tfa ON tfa.id = sr.alias_id
       WHERE tm.team_id = ?
       ORDER BY tm.id
       LIMIT ? OFFSET ?`,
    )
    .all(teamId, pageSize, offset) as {
    response_id: number;
    slot_number: number | null;
    display_name: string | null;
  }[];

  const members: TeamMember[] = rows.map((r) => ({
    response_id: r.response_id,
    submission_label:
      r.display_name ?? (r.slot_number !== null ? `Submission ${r.slot_number}` : `Response ${r.response_id}`),
  }));

  return { members, total, page, pageSize };
}

export function getResponses(
  db: DB,
  sessionId: number,
  managerId: number,
): ResponseRow[] {
  const session = getSessionRow(db, sessionId);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);

  return db
    .prepare(
      `SELECT sr.id, sr.slot_number, sr.alias_id, sr.answers, sr.submitted_at,
              sr.is_excluded, tfa.display_name
       FROM survey_responses sr
       LEFT JOIN team_formation_aliases tfa ON tfa.id = sr.alias_id
       WHERE sr.team_formation_id = ?
       ORDER BY sr.submitted_at ASC`,
    )
    .all(sessionId) as ResponseRow[];
}

export function getAggregate(
  db: DB,
  sessionId: number,
  managerId: number,
): QuestionAggregate[] {
  const session = getSessionRow(db, sessionId);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);

  if (!session.survey_snapshot) return [];
  const snapshot = JSON.parse(session.survey_snapshot) as Snapshot;
  const questions = snapshot.questions;

  const allAnswers = (
    db
      .prepare("SELECT answers FROM survey_responses WHERE team_formation_id = ?")
      .all(sessionId) as { answers: string }[]
  ).map((r) => JSON.parse(r.answers) as Record<string, unknown>);

  return questions
    .filter((q) => q.block_type !== "avoid_respondent")
    .map((q) => {
      const qIdStr = String(q.id);
      const qAnswers = allAnswers
        .map((a) => a[qIdStr])
        .filter((a) => a !== undefined && a !== null);

      let data: unknown = null;

      switch (q.block_type) {
        case "skill_selection":
        case "negative_skill": {
          const cats = ((q.config.categories ?? []) as string[]);
          const counts = new Map<string, number>(cats.map((c) => [c, 0]));
          for (const a of qAnswers) {
            if (Array.isArray(a)) {
              for (const cat of a as string[]) {
                if (counts.has(cat)) counts.set(cat, counts.get(cat)! + 1);
              }
            }
          }
          data = Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
          break;
        }
        case "skill_level": {
          const cfg = q.config as { parent_question_id: number };
          const parentQ = questions.find((pq) => pq.id === cfg.parent_question_id);
          const cats = ((parentQ?.config.categories ?? []) as string[]);
          data = cats.map((cat) => {
            const scores = (qAnswers as Record<string, unknown>[])
              .map((a) => a[cat])
              .filter((v): v is number => typeof v === "number");
            return {
              category: cat,
              mean: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
              responses: scores.length,
            };
          });
          break;
        }
        case "custom_scale": {
          const nums = qAnswers.filter((a): a is number => typeof a === "number");
          data = {
            mean: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
            min: nums.length ? Math.min(...nums) : null,
            max: nums.length ? Math.max(...nums) : null,
            count: nums.length,
          };
          break;
        }
        case "multiple_choice": {
          const opts = ((q.config.options ?? []) as string[]);
          const counts = new Map<string, number>(opts.map((o) => [o, 0]));
          for (const a of qAnswers) {
            if (Array.isArray(a)) {
              for (const opt of a as string[]) {
                if (counts.has(opt)) counts.set(opt, counts.get(opt)! + 1);
              }
            }
          }
          const total = qAnswers.length;
          data = Array.from(counts.entries()).map(([option, count]) => ({
            option,
            count,
            percentage: total ? Math.round((count / total) * 100) : 0,
          }));
          break;
        }
        case "written_answer": {
          data = { answers: qAnswers.filter((a): a is string => typeof a === "string") };
          break;
        }
      }

      return { question_id: q.id, block_type: q.block_type, prompt: q.prompt, response_count: qAnswers.length, data };
    });
}

export function exportCsv(db: DB, sessionId: number, managerId: number): string {
  const session = getSessionRow(db, sessionId);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);

  if (!session.survey_snapshot) return "Team Name,Submission Label\n";
  const snapshot = JSON.parse(session.survey_snapshot) as Snapshot;
  const questions = snapshot.questions;

  const responses = db
    .prepare(
      `SELECT sr.id, sr.slot_number, sr.alias_id, sr.answers, sr.submitted_at,
              tfa.display_name,
              t.name as team_name
       FROM survey_responses sr
       LEFT JOIN team_formation_aliases tfa ON tfa.id = sr.alias_id
       LEFT JOIN team_members tm ON tm.response_id = sr.id
       LEFT JOIN teams t ON t.id = tm.team_id
       WHERE sr.team_formation_id = ?
       ORDER BY t.sort_order, sr.submitted_at`,
    )
    .all(sessionId) as {
    id: number;
    slot_number: number | null;
    alias_id: number | null;
    answers: string;
    submitted_at: number;
    display_name: string | null;
    team_name: string | null;
  }[];

  // Build header columns
  const skillLevelQs = questions.filter((q) => q.block_type === "skill_level");
  const customScaleQs = questions.filter((q) => q.block_type === "custom_scale");
  const multipleChoiceQs = questions.filter((q) => q.block_type === "multiple_choice");
  const writtenAnswerQs = questions.filter((q) => q.block_type === "written_answer");

  const skillCols: { questionId: number; category: string }[] = [];
  for (const q of skillLevelQs) {
    const cfg = q.config as { parent_question_id: number };
    const parentQ = questions.find((pq) => pq.id === cfg.parent_question_id);
    const cats = ((parentQ?.config.categories ?? []) as string[]);
    for (const cat of cats) skillCols.push({ questionId: q.id, category: cat });
  }

  const headers = [
    "Team Name",
    "Submission Label",
    ...skillCols.map((c) => `${c.category} (skill)`),
    ...customScaleQs.map((q) => q.prompt.slice(0, 64)),
    ...multipleChoiceQs.map((q) => q.prompt.slice(0, 64)),
    ...writtenAnswerQs.map((q) => q.prompt.slice(0, 64)),
  ];

  const escapeCsv = (v: string): string => `"${v.replace(/"/g, '""')}"`;

  const lines = [headers.map(escapeCsv).join(",")];

  for (const r of responses) {
    const answers = JSON.parse(r.answers) as Record<string, unknown>;
    const label =
      r.display_name ?? (r.slot_number !== null ? `Submission ${r.slot_number}` : `Response ${r.id}`);

    const row = [
      r.team_name ?? "",
      label,
      ...skillCols.map(({ questionId, category }) => {
        const a = answers[String(questionId)] as Record<string, number> | undefined;
        return a?.[category]?.toString() ?? "";
      }),
      ...customScaleQs.map((q) => {
        const a = answers[String(q.id)];
        return typeof a === "number" ? String(a) : "";
      }),
      ...multipleChoiceQs.map((q) => {
        const a = answers[String(q.id)];
        return Array.isArray(a) ? (a as string[]).join("|") : "";
      }),
      ...writtenAnswerQs.map((q) => {
        const a = answers[String(q.id)];
        return typeof a === "string" ? a : "";
      }),
    ];

    lines.push(row.map(escapeCsv).join(","));
  }

  return lines.join("\n");
}

// ── Post-formation editing ─────────────────────────────────────────────────

export function renameTeam(
  db: DB,
  sessionId: number,
  teamId: number,
  managerId: number,
  name: string,
): TeamResult {
  const session = getSessionRow(db, sessionId);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);

  const team = db
    .prepare("SELECT id FROM teams WHERE id = ? AND team_formation_id = ?")
    .get(teamId, sessionId);
  if (!team) throw httpError(404, "team not found");

  db.prepare("UPDATE teams SET name = ? WHERE id = ?").run(name, teamId);

  return db
    .prepare(
      `SELECT t.id, t.name, t.sort_order, COUNT(tm.id) as member_count
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id
       WHERE t.id = ?
       GROUP BY t.id`,
    )
    .get(teamId) as TeamResult;
}

export function moveTeamMember(
  db: DB,
  sessionId: number,
  responseId: number,
  toTeamId: number,
  managerId: number,
): void {
  const session = getSessionRow(db, sessionId);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);

  const team = db
    .prepare("SELECT id FROM teams WHERE id = ? AND team_formation_id = ?")
    .get(toTeamId, sessionId);
  if (!team) throw httpError(404, "team not found");

  const response = db
    .prepare("SELECT id FROM survey_responses WHERE id = ? AND team_formation_id = ?")
    .get(responseId, sessionId);
  if (!response) throw httpError(404, "response not found");

  db.transaction(() => {
    db.prepare("DELETE FROM team_members WHERE response_id = ?").run(responseId);
    db.prepare("INSERT INTO team_members (team_id, response_id) VALUES (?, ?)").run(toTeamId, responseId);
  })();
}

export function setResponseExcluded(
  db: DB,
  sessionId: number,
  responseId: number,
  managerId: number,
  excluded: boolean,
): void {
  const session = getSessionRow(db, sessionId);
  if (!session) throw httpError(404, "session not found");
  assertOwner(session, managerId);

  const info = db
    .prepare(
      "UPDATE survey_responses SET is_excluded = ? WHERE id = ? AND team_formation_id = ?",
    )
    .run(excluded ? 1 : 0, responseId, sessionId);
  if (info.changes === 0) throw httpError(404, "response not found");
}

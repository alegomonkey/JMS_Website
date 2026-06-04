import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateCodeLimiter } from "../middleware/rateLimit.js";
import {
  addAlias,
  closeSession,
  createSession,
  exportCsv,
  formTeams,
  getAggregate,
  getAliases,
  getParticipantSnapshot,
  getResults,
  getResponses,
  getSession,
  getSessions,
  launchSession,
  lazyCloseCheck,
  moveTeamMember,
  removeAlias,
  renameTeam,
  reserveSlot,
  setResponseExcluded,
  submitResponse,
  getTeamMembers,
  updateSession,
  validateInviteCode,
} from "../services/teamFormationService.js";

// ── Schemas ────────────────────────────────────────────────────────────────

const idParamSchema = z.object({ id: z.coerce.number().int().positive() }).strict();
const teamIdParamSchema = z
  .object({ id: z.coerce.number().int().positive(), teamId: z.coerce.number().int().positive() })
  .strict();
const aliasIdParamSchema = z
  .object({ id: z.coerce.number().int().positive(), aliasId: z.coerce.number().int().positive() })
  .strict();

const paginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const createSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    num_teams: z.number().int().min(2),
    target_team_size: z.number().int().min(1),
    slot_mode: z.enum(["numbered", "named"]).default("numbered"),
    slot_count: z.number().int().min(1),
    survey_id: z.number().int().positive().nullable().optional(),
    closes_at: z.number().int().positive().nullable().optional(),
  })
  .strict();

const updateSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    num_teams: z.number().int().min(2).optional(),
    target_team_size: z.number().int().min(1).optional(),
    slot_mode: z.enum(["numbered", "named"]).optional(),
    slot_count: z.number().int().min(1).optional(),
    survey_id: z.number().int().positive().nullable().optional(),
    closes_at: z.number().int().positive().nullable().optional(),
  })
  .strict();

const validateCodeSchema = z
  .object({ code: z.string().trim().min(1).max(20) })
  .strict();

const aliasBodySchema = z
  .object({ display_name: z.string().trim().min(1).max(100), sort_order: z.number().int().min(0).optional() })
  .strict();

const submitResponseSchema = z
  .object({
    slot_number: z.number().int().positive().optional(),
    alias_id: z.number().int().positive().optional(),
    answers: z.record(z.string(), z.unknown()),
  })
  .strict();

const teamRenameSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();

const responseIdParamSchema = z
  .object({ id: z.coerce.number().int().positive(), responseId: z.coerce.number().int().positive() })
  .strict();

const teamMemberParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    teamId: z.coerce.number().int().positive(),
    responseId: z.coerce.number().int().positive(),
  })
  .strict();

const excludeSchema = z.object({ is_excluded: z.boolean() }).strict();

// ── Helper: ensure the session belongs to the authenticated manager ────────

function loadManagerSession(db: DB, id: number, managerId: number) {
  const session = getSession(db, id);
  if (!session) throw httpError(404, "session not found");
  if (session.manager_id !== managerId) throw httpError(403, "forbidden");
  return session;
}

// ── Router ─────────────────────────────────────────────────────────────────

export function teamFormationsRouter(db: DB): Router {
  const r = Router();

  // POST /team-formations/validate-code  — no auth, rate-limited
  // Must be registered before /:id routes so Express doesn't match
  // "validate-code" as an :id parameter on a hypothetical POST /:id route.
  r.post("/team-formations/validate-code", validateCodeLimiter, (req, res, next) => {
    try {
      const { code } = validateCodeSchema.parse(req.body);
      const session = validateInviteCode(db, code);
      if (!session) {
        res.status(404).json({ error: "invalid or inactive invite code" });
        return;
      }
      res.json({ session });
    } catch (err) {
      next(err);
    }
  });

  // POST /team-formations
  r.post("/team-formations", requireAuth, (req, res, next) => {
    try {
      const body = createSessionSchema.parse(req.body);
      const managerId = req.session.userId as number;
      const session = createSession(db, managerId, body);
      res.status(201).json({ session });
    } catch (err) {
      next(err);
    }
  });

  // GET /team-formations
  r.get("/team-formations", requireAuth, (req, res, next) => {
    try {
      const managerId = req.session.userId as number;
      const sessions = getSessions(db, managerId);
      res.json({ sessions });
    } catch (err) {
      next(err);
    }
  });

  // GET /team-formations/:id
  r.get("/team-formations/:id", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const managerId = req.session.userId as number;
      const session = loadManagerSession(db, id, managerId);
      res.json({ session });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /team-formations/:id
  r.patch("/team-formations/:id", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const patch = updateSessionSchema.parse(req.body);
      const managerId = req.session.userId as number;
      const session = updateSession(db, id, managerId, patch);
      res.json({ session });
    } catch (err) {
      next(err);
    }
  });

  // POST /team-formations/:id/launch
  r.post("/team-formations/:id/launch", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const managerId = req.session.userId as number;
      const session = launchSession(db, id, managerId);
      res.json({ session });
    } catch (err) {
      next(err);
    }
  });

  // POST /team-formations/:id/close
  r.post("/team-formations/:id/close", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const managerId = req.session.userId as number;
      const session = closeSession(db, id, managerId);
      res.json({ session });
    } catch (err) {
      next(err);
    }
  });

  // POST /team-formations/:id/form-teams
  r.post("/team-formations/:id/form-teams", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const managerId = req.session.userId as number;
      const result = formTeams(db, id, managerId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /team-formations/:id/results
  r.get("/team-formations/:id/results", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const managerId = req.session.userId as number;
      const teams = getResults(db, id, managerId);
      res.json({ teams });
    } catch (err) {
      next(err);
    }
  });

  // GET /team-formations/:id/teams/:teamId
  r.get("/team-formations/:id/teams/:teamId", requireAuth, (req, res, next) => {
    try {
      const { id, teamId } = teamIdParamSchema.parse(req.params);
      const { page, pageSize } = paginationSchema.parse(req.query);
      const managerId = req.session.userId as number;
      const result = getTeamMembers(db, id, managerId, teamId, page, pageSize);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /team-formations/:id/export
  r.get("/team-formations/:id/export", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const managerId = req.session.userId as number;
      const session = loadManagerSession(db, id, managerId);
      const csvText = exportCsv(db, id, managerId);
      const safeName = session.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeName}-teams-${date}.csv"`,
      );
      res.send(csvText);
    } catch (err) {
      next(err);
    }
  });

  // POST /team-formations/:id/aliases
  r.post("/team-formations/:id/aliases", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { display_name, sort_order } = aliasBodySchema.parse(req.body);
      const managerId = req.session.userId as number;
      const alias = addAlias(db, id, managerId, display_name, sort_order);
      res.status(201).json({ alias });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /team-formations/:id/aliases/:aliasId
  r.delete("/team-formations/:id/aliases/:aliasId", requireAuth, (req, res, next) => {
    try {
      const { id, aliasId } = aliasIdParamSchema.parse(req.params);
      const managerId = req.session.userId as number;
      removeAlias(db, id, managerId, aliasId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // GET /team-formations/:id/aliases
  r.get("/team-formations/:id/aliases", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const managerId = req.session.userId as number;
      const aliases = getAliases(db, id, managerId);
      res.json({ aliases });
    } catch (err) {
      next(err);
    }
  });

  // GET /team-formations/:id/snapshot  — no auth, participant endpoint
  r.get("/team-formations/:id/snapshot", (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      lazyCloseCheck(db, id);
      const snap = getParticipantSnapshot(db, id);
      if (!snap) {
        res.status(404).json({ error: "no snapshot available" });
        return;
      }
      res.json(snap);
    } catch (err) {
      next(err);
    }
  });

  // POST /team-formations/:id/reserve-slot  — no auth, participant endpoint
  r.post("/team-formations/:id/reserve-slot", (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      lazyCloseCheck(db, id);

      // Ensure session is persisted so the slot token survives across requests.
      if (!req.session.slotToken) {
        req.session.slotToken = randomBytes(32).toString("hex");
      }
      const sessionToken = req.session.slotToken;

      const slotNumber = reserveSlot(db, id, sessionToken);
      res.json({ slot_number: slotNumber });
    } catch (err) {
      next(err);
    }
  });

  // POST /team-formations/:id/responses  — no auth, participant endpoint
  r.post("/team-formations/:id/responses", (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      lazyCloseCheck(db, id);

      const session = getSession(db, id);
      if (!session) {
        next(httpError(404, "session not found"));
        return;
      }

      const body = submitResponseSchema.parse(req.body);

      if (session.slot_mode === "numbered") {
        if (body.slot_number === undefined) {
          next(httpError(400, "slot_number required for numbered mode"));
          return;
        }
        const sessionToken = req.session.slotToken;
        if (!sessionToken) {
          next(httpError(400, "no slot reservation found — reserve a slot first"));
          return;
        }
        const responseId = submitResponse(db, id, {
          mode: "numbered",
          slotNumber: body.slot_number,
          sessionToken,
          answers: body.answers,
        });
        res.status(201).json({ response_id: responseId });
      } else {
        if (body.alias_id === undefined) {
          next(httpError(400, "alias_id required for named mode"));
          return;
        }
        const responseId = submitResponse(db, id, {
          mode: "named",
          aliasId: body.alias_id,
          answers: body.answers,
        });
        res.status(201).json({ response_id: responseId });
      }
    } catch (err) {
      next(err);
    }
  });

  // GET /team-formations/:id/responses  — manager only
  r.get("/team-formations/:id/responses", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const managerId = req.session.userId as number;
      const responses = getResponses(db, id, managerId);
      res.json({ responses });
    } catch (err) {
      next(err);
    }
  });

  // GET /team-formations/:id/aggregate  — manager only
  r.get("/team-formations/:id/aggregate", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const managerId = req.session.userId as number;
      const aggregate = getAggregate(db, id, managerId);
      res.json({ aggregate });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /team-formations/:id/teams/:teamId  — rename team, manager only
  r.patch("/team-formations/:id/teams/:teamId", requireAuth, (req, res, next) => {
    try {
      const { id, teamId } = teamIdParamSchema.parse(req.params);
      const { name } = teamRenameSchema.parse(req.body);
      const managerId = req.session.userId as number;
      const team = renameTeam(db, id, teamId, managerId, name);
      res.json({ team });
    } catch (err) {
      next(err);
    }
  });

  // PUT /team-formations/:id/teams/:teamId/members/:responseId  — move member, manager only
  r.put("/team-formations/:id/teams/:teamId/members/:responseId", requireAuth, (req, res, next) => {
    try {
      const { id, teamId, responseId } = teamMemberParamSchema.parse(req.params);
      const managerId = req.session.userId as number;
      moveTeamMember(db, id, responseId, teamId, managerId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // PATCH /team-formations/:id/responses/:responseId  — set is_excluded, manager only
  r.patch("/team-formations/:id/responses/:responseId", requireAuth, (req, res, next) => {
    try {
      const { id, responseId } = responseIdParamSchema.parse(req.params);
      const { is_excluded } = excludeSchema.parse(req.body);
      const managerId = req.session.userId as number;
      setResponseExcluded(db, id, responseId, managerId, is_excluded);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return r;
}

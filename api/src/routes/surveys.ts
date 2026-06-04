import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { httpError } from "../middleware/errorHandler.js";
import {
  addQuestion,
  approveSurvey,
  createSurvey,
  deleteSurvey,
  deleteQuestion,
  forkSurvey,
  getPendingSurveys,
  getSurveyWithQuestions,
  getSurveys,
  reorderQuestions,
  updateQuestion,
  updateSurvey,
  type Survey,
} from "../services/surveyService.js";
import { requireAdmin } from "../middleware/auth.js";

const createSurveySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    is_public: z.boolean().optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  })
  .strict();

const updateSurveySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    is_public: z.boolean().optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  })
  .strict();

const idParamSchema = z.object({ id: z.coerce.number().int().positive() }).strict();
const questionIdParamSchema = z
  .object({ id: z.coerce.number().int().positive(), qId: z.coerce.number().int().positive() })
  .strict();

const addQuestionSchema = z
  .object({
    block_type: z.string().trim().min(1).max(50),
    prompt: z.string().trim().max(500).default(""),
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

const updateQuestionSchema = z
  .object({
    prompt: z.string().trim().max(500).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const reorderSchema = z
  .object({ ids: z.array(z.number().int().positive()).min(1) })
  .strict();

function toPublic(survey: Survey) {
  return { ...survey, tags: JSON.parse(survey.tags) as string[] };
}

export function surveysRouter(db: DB): Router {
  const r = Router();

  r.post("/surveys", requireAuth, (req, res, next) => {
    try {
      const body = createSurveySchema.parse(req.body);
      const ownerId = req.session.userId as number;
      const survey = createSurvey(db, ownerId, body);
      res.status(201).json({ survey: toPublic(survey) });
    } catch (err) {
      next(err);
    }
  });

  r.get("/surveys", requireAuth, (req, res, next) => {
    try {
      const userId = req.session.userId as number;
      const surveys = getSurveys(db, userId);
      res.json({ surveys: surveys.map(toPublic) });
    } catch (err) {
      next(err);
    }
  });

  r.get("/surveys/:id", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = getSurveyWithQuestions(db, id);
      if (!data) {
        next(httpError(404, "survey not found"));
        return;
      }
      res.json({
        survey: toPublic(data.survey),
        questions: data.questions.map((q) => ({
          ...q,
          config: JSON.parse(q.config) as unknown,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  r.patch("/surveys/:id", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const patch = updateSurveySchema.parse(req.body);
      const ownerId = req.session.userId as number;
      const survey = updateSurvey(db, id, ownerId, patch);
      res.json({ survey: toPublic(survey) });
    } catch (err) {
      next(err);
    }
  });

  r.delete("/surveys/:id", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const ownerId = req.session.userId as number;
      deleteSurvey(db, id, ownerId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // POST /surveys/:id/questions/reorder — must come before /:id/questions/:qId
  r.post("/surveys/:id/questions/reorder", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { ids } = reorderSchema.parse(req.body);
      const ownerId = req.session.userId as number;
      reorderQuestions(db, id, ownerId, ids);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // POST /surveys/:id/questions
  r.post("/surveys/:id/questions", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const body = addQuestionSchema.parse(req.body);
      const ownerId = req.session.userId as number;
      const question = addQuestion(db, id, ownerId, body);
      res.status(201).json({ question: { ...question, config: JSON.parse(question.config) as unknown } });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /surveys/:id/questions/:qId
  r.patch("/surveys/:id/questions/:qId", requireAuth, (req, res, next) => {
    try {
      const { id, qId } = questionIdParamSchema.parse(req.params);
      const patch = updateQuestionSchema.parse(req.body);
      const ownerId = req.session.userId as number;
      const question = updateQuestion(db, qId, id, ownerId, patch);
      res.json({ question: { ...question, config: JSON.parse(question.config) as unknown } });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /surveys/:id/questions/:qId
  r.delete("/surveys/:id/questions/:qId", requireAuth, (req, res, next) => {
    try {
      const { id, qId } = questionIdParamSchema.parse(req.params);
      const ownerId = req.session.userId as number;
      deleteQuestion(db, qId, id, ownerId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // POST /surveys/:id/fork
  r.post("/surveys/:id/fork", requireAuth, (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const newOwnerId = req.session.userId as number;
      const data = forkSurvey(db, id, newOwnerId);
      res.status(201).json({
        survey: toPublic(data.survey),
        questions: data.questions.map((q) => ({
          ...q,
          config: JSON.parse(q.config) as unknown,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /admin/surveys — pending approval queue
  r.get("/admin/surveys", requireAdmin(db), (req, res, next) => {
    try {
      const surveys = getPendingSurveys(db);
      res.json({ surveys: surveys.map(toPublic) });
    } catch (err) {
      next(err);
    }
  });

  // POST /admin/surveys/:id/approve
  r.post("/admin/surveys/:id/approve", requireAdmin(db), (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const survey = approveSurvey(db, id);
      res.json({ survey: toPublic(survey) });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

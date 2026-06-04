import type { DB } from "../db.js";
import { httpError } from "../middleware/errorHandler.js";

export interface Survey {
  id: number;
  owner_id: number;
  title: string;
  description: string | null;
  is_public: number;
  is_approved: number;
  tags: string;
  created_at: number;
  updated_at: number;
}

export interface SurveyQuestion {
  id: number;
  survey_id: number;
  sort_order: number;
  block_type: string;
  prompt: string;
  config: string;
}

export interface SurveyWithQuestions {
  survey: Survey;
  questions: SurveyQuestion[];
}

export function createSurvey(
  db: DB,
  ownerId: number,
  fields: { title: string; description?: string | null; is_public?: boolean; tags?: string[] },
): Survey {
  const tags = JSON.stringify(fields.tags ?? []);
  const info = db
    .prepare(
      `INSERT INTO surveys (owner_id, title, description, is_public, tags)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(ownerId, fields.title, fields.description ?? null, fields.is_public ? 1 : 0, tags);
  return getSurvey(db, Number(info.lastInsertRowid)) as Survey;
}

export interface SurveyWithOwner extends Survey {
  owner_username: string;
}

export function getSurveys(db: DB, userId?: number): SurveyWithOwner[] {
  if (userId !== undefined) {
    return db
      .prepare(
        `SELECT s.*, u.username AS owner_username
         FROM surveys s JOIN users u ON u.id = s.owner_id
         WHERE (s.is_public = 1 AND s.is_approved = 1) OR s.owner_id = ?
         ORDER BY s.updated_at DESC`,
      )
      .all(userId) as SurveyWithOwner[];
  }
  return db
    .prepare(
      `SELECT s.*, u.username AS owner_username
       FROM surveys s JOIN users u ON u.id = s.owner_id
       WHERE s.is_public = 1 AND s.is_approved = 1
       ORDER BY s.updated_at DESC`,
    )
    .all() as SurveyWithOwner[];
}

export function getPendingSurveys(db: DB): SurveyWithOwner[] {
  return db
    .prepare(
      `SELECT s.*, u.username AS owner_username
       FROM surveys s JOIN users u ON u.id = s.owner_id
       WHERE s.is_public = 1 AND s.is_approved = 0
       ORDER BY s.updated_at DESC`,
    )
    .all() as SurveyWithOwner[];
}

export function approveSurvey(db: DB, id: number): Survey {
  const survey = getSurvey(db, id);
  if (!survey) throw httpError(404, "survey not found");
  db.prepare("UPDATE surveys SET is_approved = 1, updated_at = unixepoch() WHERE id = ?").run(id);
  return getSurvey(db, id) as Survey;
}

export function forkSurvey(db: DB, id: number, newOwnerId: number): SurveyWithQuestions {
  const source = getSurveyWithQuestions(db, id);
  if (!source) throw httpError(404, "survey not found");

  const tags = source.survey.tags;
  const info = db
    .prepare(
      `INSERT INTO surveys (owner_id, title, description, is_public, is_approved, tags)
       VALUES (?, ?, ?, 0, 0, ?)`,
    )
    .run(newOwnerId, source.survey.title, source.survey.description, tags);
  const newSurveyId = Number(info.lastInsertRowid);

  const insert = db.prepare(
    `INSERT INTO survey_questions (survey_id, sort_order, block_type, prompt, config)
     VALUES (?, ?, ?, ?, ?)`,
  );
  // Copy questions in sort order, normalizing legacy config schemas and
  // remapping skill_level parent links from old question ids to the new ones.
  const tx = db.transaction((questions: SurveyQuestion[]) => {
    const idMap = new Map<number, number>();
    const ordered = [...questions].sort((a, b) => a.sort_order - b.sort_order);
    for (const q of ordered) {
      const config = JSON.parse(q.config) as Record<string, unknown>;
      const normalized = normalizeForkedConfig(q.block_type, config, idMap);
      const info = insert.run(
        newSurveyId,
        q.sort_order,
        q.block_type,
        q.prompt,
        JSON.stringify(normalized),
      );
      idMap.set(q.id, Number(info.lastInsertRowid));
    }
  });
  tx(source.questions);

  return getSurveyWithQuestions(db, newSurveyId) as SurveyWithQuestions;
}

// Normalizes a copied question's config to the canonical builder schema and
// remaps skill_level parent references via the old→new question id map.
function normalizeForkedConfig(
  blockType: string,
  config: Record<string, unknown>,
  idMap: Map<number, number>,
): Record<string, unknown> {
  if (blockType === "skill_selection" || blockType === "negative_skill") {
    const { categories, multi_select, ...rest } = config;
    return {
      ...rest,
      skills: config.skills ?? categories ?? [],
      multi: config.multi ?? multi_select ?? false,
    };
  }
  if (blockType === "skill_level") {
    const oldParent = config.parent_question_id as number | null | undefined;
    return {
      ...config,
      parent_question_id:
        oldParent != null && idMap.has(oldParent) ? idMap.get(oldParent)! : null,
    };
  }
  return config;
}

export function getSurvey(db: DB, id: number): Survey | null {
  const row = db.prepare("SELECT * FROM surveys WHERE id = ?").get(id) as Survey | undefined;
  return row ?? null;
}

export function getSurveyWithQuestions(db: DB, id: number): SurveyWithQuestions | null {
  const survey = getSurvey(db, id);
  if (!survey) return null;
  const questions = db
    .prepare("SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY sort_order")
    .all(id) as SurveyQuestion[];
  return { survey, questions };
}

export function updateSurvey(
  db: DB,
  id: number,
  ownerId: number,
  patch: { title?: string; description?: string | null; is_public?: boolean; tags?: string[] },
): Survey {
  const survey = getSurvey(db, id);
  if (!survey) throw httpError(404, "survey not found");
  if (survey.owner_id !== ownerId) throw httpError(403, "forbidden");

  const sets: string[] = ["updated_at = unixepoch()"];
  const params: unknown[] = [];

  if (patch.title !== undefined) {
    sets.push("title = ?");
    params.push(patch.title);
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    params.push(patch.description);
  }
  if (patch.is_public !== undefined) {
    sets.push("is_public = ?");
    params.push(patch.is_public ? 1 : 0);
  }
  if (patch.tags !== undefined) {
    sets.push("tags = ?");
    params.push(JSON.stringify(patch.tags));
  }

  params.push(id);
  db.prepare(`UPDATE surveys SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  return getSurvey(db, id) as Survey;
}

export function deleteSurvey(db: DB, id: number, ownerId: number): void {
  const survey = getSurvey(db, id);
  if (!survey) throw httpError(404, "survey not found");
  if (survey.owner_id !== ownerId) throw httpError(403, "forbidden");
  const linked = db
    .prepare("SELECT 1 FROM team_formations WHERE survey_id = ?")
    .get(id);
  if (linked) throw httpError(409, "survey is linked to one or more team formation sessions");
  db.prepare("DELETE FROM surveys WHERE id = ?").run(id);
}

export function addQuestion(
  db: DB,
  surveyId: number,
  ownerId: number,
  fields: { block_type: string; prompt: string; config: Record<string, unknown> },
): SurveyQuestion {
  const survey = getSurvey(db, surveyId);
  if (!survey) throw httpError(404, "survey not found");
  if (survey.owner_id !== ownerId) throw httpError(403, "forbidden");

  const maxRow = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM survey_questions WHERE survey_id = ?")
    .get(surveyId) as { m: number };
  const nextOrder = maxRow.m + 1;

  const info = db
    .prepare(
      `INSERT INTO survey_questions (survey_id, sort_order, block_type, prompt, config)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(surveyId, nextOrder, fields.block_type, fields.prompt, JSON.stringify(fields.config));

  return db
    .prepare("SELECT * FROM survey_questions WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as SurveyQuestion;
}

export function updateQuestion(
  db: DB,
  questionId: number,
  surveyId: number,
  ownerId: number,
  patch: { prompt?: string; config?: Record<string, unknown> },
): SurveyQuestion {
  const survey = getSurvey(db, surveyId);
  if (!survey) throw httpError(404, "survey not found");
  if (survey.owner_id !== ownerId) throw httpError(403, "forbidden");

  const question = db
    .prepare("SELECT * FROM survey_questions WHERE id = ? AND survey_id = ?")
    .get(questionId, surveyId) as SurveyQuestion | undefined;
  if (!question) throw httpError(404, "question not found");

  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.prompt !== undefined) {
    sets.push("prompt = ?");
    params.push(patch.prompt);
  }
  if (patch.config !== undefined) {
    sets.push("config = ?");
    params.push(JSON.stringify(patch.config));
  }

  if (sets.length > 0) {
    params.push(questionId);
    db.prepare(`UPDATE survey_questions SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  }

  return db
    .prepare("SELECT * FROM survey_questions WHERE id = ?")
    .get(questionId) as SurveyQuestion;
}

export function deleteQuestion(
  db: DB,
  questionId: number,
  surveyId: number,
  ownerId: number,
): void {
  const survey = getSurvey(db, surveyId);
  if (!survey) throw httpError(404, "survey not found");
  if (survey.owner_id !== ownerId) throw httpError(403, "forbidden");

  const question = db
    .prepare("SELECT * FROM survey_questions WHERE id = ? AND survey_id = ?")
    .get(questionId, surveyId) as SurveyQuestion | undefined;
  if (!question) throw httpError(404, "question not found");

  db.prepare("DELETE FROM survey_questions WHERE id = ?").run(questionId);
}

export function reorderQuestions(
  db: DB,
  surveyId: number,
  ownerId: number,
  orderedIds: number[],
): void {
  const survey = getSurvey(db, surveyId);
  if (!survey) throw httpError(404, "survey not found");
  if (survey.owner_id !== ownerId) throw httpError(403, "forbidden");

  const update = db.prepare(
    "UPDATE survey_questions SET sort_order = ? WHERE id = ? AND survey_id = ?",
  );
  const tx = db.transaction((ids: number[]) => {
    ids.forEach((id, index) => {
      update.run(index, id, surveyId);
    });
  });
  tx(orderedIds);
}

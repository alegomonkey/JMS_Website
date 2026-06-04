import { apiRequest } from "./api.js";

export interface Survey {
  id: number;
  owner_id: number;
  owner_username: string;
  title: string;
  description: string | null;
  is_public: number;
  is_approved: number;
  tags: string[];
  created_at: number;
  updated_at: number;
}

export interface SurveyQuestion {
  id: number;
  survey_id: number;
  sort_order: number;
  block_type: string;
  prompt: string;
  config: Record<string, unknown>;
}

export type BlockType =
  | "skill_selection"
  | "skill_level"
  | "written_answer"
  | "negative_skill"
  | "avoid_respondent"
  | "custom_scale"
  | "multiple_choice";

export function fetchSurveys(): Promise<{ surveys: Survey[] }> {
  return apiRequest("/api/surveys");
}

export function createSurvey(body: {
  title: string;
  description?: string | null;
  is_public?: boolean;
  tags?: string[];
}): Promise<{ survey: Survey }> {
  return apiRequest("/api/surveys", { method: "POST", body });
}

export function updateSurvey(
  id: number,
  patch: { title?: string; description?: string | null; is_public?: boolean; tags?: string[] },
): Promise<{ survey: Survey }> {
  return apiRequest(`/api/surveys/${id}`, { method: "PATCH", body: patch });
}

export function deleteSurvey(id: number): Promise<void> {
  return apiRequest(`/api/surveys/${id}`, { method: "DELETE" });
}

export function fetchSurveyWithQuestions(
  id: number,
): Promise<{ survey: Survey; questions: SurveyQuestion[] }> {
  return apiRequest(`/api/surveys/${id}`);
}

export function addQuestion(
  surveyId: number,
  body: { block_type: string; prompt: string; config: Record<string, unknown> },
): Promise<{ question: SurveyQuestion }> {
  return apiRequest(`/api/surveys/${surveyId}/questions`, { method: "POST", body });
}

export function updateQuestion(
  surveyId: number,
  questionId: number,
  patch: { prompt?: string; config?: Record<string, unknown> },
): Promise<{ question: SurveyQuestion }> {
  return apiRequest(`/api/surveys/${surveyId}/questions/${questionId}`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteQuestion(surveyId: number, questionId: number): Promise<void> {
  return apiRequest(`/api/surveys/${surveyId}/questions/${questionId}`, { method: "DELETE" });
}

export function reorderQuestions(surveyId: number, ids: number[]): Promise<void> {
  return apiRequest(`/api/surveys/${surveyId}/questions/reorder`, {
    method: "POST",
    body: { ids },
  });
}

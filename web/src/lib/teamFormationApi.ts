import { apiRequest } from "./api.js";

export interface TeamFormation {
  id: number;
  manager_id: number;
  title: string;
  description: string | null;
  num_teams: number;
  target_team_size: number;
  survey_id: number | null;
  invite_code: string;
  slot_mode: "numbered" | "named";
  slot_count: number;
  slots_submitted: number;
  status: "draft" | "active" | "closed" | "formed";
  closes_at: number | null;
  rng_seed: number | null;
  formed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface Alias {
  id: number;
  team_formation_id: number;
  display_name: string;
  sort_order: number;
  created_at: number;
}

export interface CreateSessionBody {
  title: string;
  description?: string | null;
  num_teams: number;
  target_team_size: number;
  slot_mode: "numbered" | "named";
  slot_count: number;
  survey_id?: number | null;
  closes_at?: number | null;
}

export type UpdateSessionBody = Partial<CreateSessionBody>;

export function createSession(body: CreateSessionBody): Promise<{ session: TeamFormation }> {
  return apiRequest("/api/team-formations", { method: "POST", body });
}

export function updateSession(
  id: number,
  patch: UpdateSessionBody,
): Promise<{ session: TeamFormation }> {
  return apiRequest(`/api/team-formations/${id}`, { method: "PATCH", body: patch });
}

export function fetchSessions(): Promise<{ sessions: TeamFormation[] }> {
  return apiRequest("/api/team-formations");
}

export function fetchSession(id: number): Promise<{ session: TeamFormation }> {
  return apiRequest(`/api/team-formations/${id}`);
}

export function launchSession(id: number): Promise<{ session: TeamFormation }> {
  return apiRequest(`/api/team-formations/${id}/launch`, { method: "POST" });
}

export function fetchAliases(id: number): Promise<{ aliases: Alias[] }> {
  return apiRequest(`/api/team-formations/${id}/aliases`);
}

export function addAlias(id: number, display_name: string): Promise<{ alias: Alias }> {
  return apiRequest(`/api/team-formations/${id}/aliases`, { method: "POST", body: { display_name } });
}

export function removeAlias(id: number, aliasId: number): Promise<void> {
  return apiRequest(`/api/team-formations/${id}/aliases/${aliasId}`, { method: "DELETE" });
}

// ── Results & post-formation ───────────────────────────────────────────────

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

export interface ResponseEntry {
  id: number;
  slot_number: number | null;
  alias_id: number | null;
  display_name: string | null;
  answers: string;
  submitted_at: number;
  is_excluded: number;
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

export function closeSession(id: number): Promise<{ session: TeamFormation }> {
  return apiRequest(`/api/team-formations/${id}/close`, { method: "POST" });
}

export function formTeams(id: number): Promise<FormTeamsResult> {
  return apiRequest(`/api/team-formations/${id}/form-teams`, { method: "POST" });
}

export function fetchResults(id: number): Promise<{ teams: TeamResult[] }> {
  return apiRequest(`/api/team-formations/${id}/results`);
}

export function fetchTeamMembers(
  id: number,
  teamId: number,
  page = 1,
  pageSize = 20,
): Promise<PaginatedMembers> {
  return apiRequest(
    `/api/team-formations/${id}/teams/${teamId}?page=${page}&pageSize=${pageSize}`,
  );
}

export function fetchResponses(id: number): Promise<{ responses: ResponseEntry[] }> {
  return apiRequest(`/api/team-formations/${id}/responses`);
}

export function fetchAggregate(id: number): Promise<{ aggregate: QuestionAggregate[] }> {
  return apiRequest(`/api/team-formations/${id}/aggregate`);
}

export function renameTeam(
  id: number,
  teamId: number,
  name: string,
): Promise<{ team: TeamResult }> {
  return apiRequest(`/api/team-formations/${id}/teams/${teamId}`, { method: "PATCH", body: { name } });
}

export function moveTeamMember(
  id: number,
  toTeamId: number,
  responseId: number,
): Promise<void> {
  return apiRequest(
    `/api/team-formations/${id}/teams/${toTeamId}/members/${responseId}`,
    { method: "PUT" },
  );
}

export function setResponseExcluded(
  id: number,
  responseId: number,
  excluded: boolean,
): Promise<void> {
  return apiRequest(`/api/team-formations/${id}/responses/${responseId}`, {
    method: "PATCH",
    body: { is_excluded: excluded },
  });
}

export function downloadCsv(id: number): void {
  const a = document.createElement("a");
  a.href = `/api/team-formations/${id}/export`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export interface SnapshotQuestion {
  id: number;
  sort_order: number;
  block_type: string;
  prompt: string;
  config: Record<string, unknown>;
}

export interface ParticipantSnapshot {
  survey: { id: number; title: string; description: string | null; tags: string[] };
  questions: SnapshotQuestion[];
}

export function validateCode(code: string): Promise<{ session: TeamFormation }> {
  return apiRequest("/api/team-formations/validate-code", { method: "POST", body: { code } });
}

export function getParticipantSnapshot(id: number): Promise<ParticipantSnapshot> {
  return apiRequest(`/api/team-formations/${id}/snapshot`);
}

export function reserveParticipantSlot(id: number): Promise<{ slot_number: number }> {
  return apiRequest(`/api/team-formations/${id}/reserve-slot`, { method: "POST" });
}

export function submitParticipantResponse(
  id: number,
  body: { slot_number?: number; alias_id?: number; answers: Record<string, unknown> },
): Promise<{ response_id: number }> {
  return apiRequest(`/api/team-formations/${id}/responses`, { method: "POST", body });
}

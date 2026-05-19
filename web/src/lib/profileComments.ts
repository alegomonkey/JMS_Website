import { apiRequest } from "./api";

export interface ProfileComment {
  id: number;
  body: string;
  username: string;
  author_user_id: number;
  created_at: number;
}

export async function fetchProfileComments(username: string): Promise<ProfileComment[]> {
  const res = await apiRequest<{ comments: ProfileComment[] }>(
    `/api/users/${encodeURIComponent(username)}/comments`,
  );
  return res.comments;
}

export async function postProfileComment(
  username: string,
  body: string,
): Promise<ProfileComment> {
  const res = await apiRequest<{ comment: ProfileComment }>(
    `/api/users/${encodeURIComponent(username)}/comments`,
    { method: "POST", body: { body } },
  );
  return res.comment;
}

export async function deleteProfileComment(username: string, id: number): Promise<void> {
  await apiRequest<void>(
    `/api/users/${encodeURIComponent(username)}/comments/${id}`,
    { method: "DELETE" },
  );
}

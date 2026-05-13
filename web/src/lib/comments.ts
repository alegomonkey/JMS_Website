import { apiRequest } from "./api";

export interface Comment {
  id: number;
  body: string;
  username: string;
  votes: number;
  voted: number;
  created_at: number;
}

export type Sort = "top" | "new";

export async function fetchComments(slug: string, sort: Sort): Promise<Comment[]> {
  const res = await apiRequest<{ comments: Comment[] }>(
    `/api/projects/${slug}/comments?sort=${sort}`,
  );
  return res.comments;
}

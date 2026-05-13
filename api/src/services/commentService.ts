import type { DB } from "../db.js";

export interface CommentRow {
  id: number;
  body: string;
  username: string;
  votes: number;
  voted: number;
  created_at: number;
}

export type Sort = "top" | "new";

export interface CreatedComment {
  id: number;
  body: string;
  username: string;
  votes: number;
  voted: number;
  created_at: number;
}

// id DESC is a tiebreaker — created_at has 1-second granularity so two
// quick comments can share a timestamp; without the tiebreaker their order
// is undefined.
const LIST_TOP = `
  SELECT c.id, c.body, u.username, c.created_at,
         (SELECT COUNT(*) FROM votes v WHERE v.comment_id = c.id) AS votes,
         CASE WHEN ? IS NULL THEN 0
              ELSE (SELECT COUNT(*) FROM votes v WHERE v.comment_id = c.id AND v.user_id = ?)
         END AS voted
  FROM comments c JOIN users u ON u.id = c.user_id
  WHERE c.project = ?
  ORDER BY votes DESC, c.created_at DESC, c.id DESC
  LIMIT 500
`;

const LIST_NEW = `
  SELECT c.id, c.body, u.username, c.created_at,
         (SELECT COUNT(*) FROM votes v WHERE v.comment_id = c.id) AS votes,
         CASE WHEN ? IS NULL THEN 0
              ELSE (SELECT COUNT(*) FROM votes v WHERE v.comment_id = c.id AND v.user_id = ?)
         END AS voted
  FROM comments c JOIN users u ON u.id = c.user_id
  WHERE c.project = ?
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT 500
`;

export function listComments(
  db: DB,
  project: string,
  sort: Sort,
  viewerId: number | null,
): CommentRow[] {
  const sql = sort === "new" ? LIST_NEW : LIST_TOP;
  return db.prepare(sql).all(viewerId, viewerId, project) as CommentRow[];
}

export function deleteComment(db: DB, id: number): boolean {
  const info = db.prepare("DELETE FROM comments WHERE id = ?").run(id);
  return info.changes > 0;
}

export function createComment(
  db: DB,
  project: string,
  userId: number,
  body: string,
): CreatedComment {
  const info = db
    .prepare("INSERT INTO comments (project, user_id, body) VALUES (?, ?, ?)")
    .run(project, userId, body);
  const id = Number(info.lastInsertRowid);
  const row = db
    .prepare(
      `SELECT c.id, c.body, u.username, c.created_at,
              0 AS votes, 0 AS voted
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
    )
    .get(id) as CreatedComment;
  return row;
}

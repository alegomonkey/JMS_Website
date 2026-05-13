import type { DB } from "../db.js";

export function commentExists(db: DB, id: number): boolean {
  const row = db.prepare("SELECT 1 AS x FROM comments WHERE id = ?").get(id);
  return row !== undefined;
}

export function addVote(db: DB, commentId: number, userId: number): number {
  db.prepare("INSERT OR IGNORE INTO votes (comment_id, user_id) VALUES (?, ?)").run(
    commentId,
    userId,
  );
  return countVotes(db, commentId);
}

export function removeVote(db: DB, commentId: number, userId: number): number {
  db.prepare("DELETE FROM votes WHERE comment_id = ? AND user_id = ?").run(commentId, userId);
  return countVotes(db, commentId);
}

function countVotes(db: DB, commentId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM votes WHERE comment_id = ?")
    .get(commentId) as { n: number };
  return row.n;
}

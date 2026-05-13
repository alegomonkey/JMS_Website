import type { Comment } from "../lib/comments";
import { VoteButton } from "./VoteButton";
import { DeleteCommentButton } from "./DeleteCommentButton";
import styles from "./CommentList.module.css";

interface Props {
  comments: Comment[];
  canVote: boolean;
  isAdmin: boolean;
  onVoteChange: (id: number, votes: number, voted: boolean) => void;
  onDelete: (id: number) => void;
}

export function CommentList({
  comments,
  canVote,
  isAdmin,
  onVoteChange,
  onDelete,
}: Props): JSX.Element {
  if (comments.length === 0) {
    return <p className={styles.empty}>No comments yet.</p>;
  }
  return (
    <ul className={styles.list}>
      {comments.map((c) => (
        <li key={c.id} className={styles.item}>
          <VoteButton
            commentId={c.id}
            votes={c.votes}
            voted={c.voted === 1}
            disabled={!canVote}
            onChange={(votes, voted) => onVoteChange(c.id, votes, voted)}
          />
          <div className={styles.body}>
            <div className={styles.meta}>
              <span className={styles.user}>{c.username}</span>
              <time>{new Date(c.created_at * 1000).toLocaleString()}</time>
              {isAdmin && (
                <DeleteCommentButton commentId={c.id} onDeleted={() => onDelete(c.id)} />
              )}
            </div>
            <p>{c.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

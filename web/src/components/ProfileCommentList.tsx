import { useState } from "react";
import { deleteProfileComment, type ProfileComment } from "../lib/profileComments";
import styles from "./CommentList.module.css";

interface Props {
  username: string;
  comments: ProfileComment[];
  canDelete: boolean;
  onDeleted: (id: number) => void;
}

export function ProfileCommentList({ username, comments, canDelete, onDeleted }: Props): JSX.Element {
  if (comments.length === 0) {
    return <p className={styles.empty}>No comments yet.</p>;
  }
  return (
    <ul className={styles.list}>
      {comments.map((c) => (
        <li key={c.id} className={styles.item}>
          <div className={styles.body}>
            <div className={styles.meta}>
              <span className={styles.user}>{c.username}</span>
              <time>{new Date(c.created_at * 1000).toLocaleString()}</time>
              {canDelete && (
                <DeleteProfileCommentButton
                  username={username}
                  commentId={c.id}
                  onDeleted={() => onDeleted(c.id)}
                />
              )}
            </div>
            <p>{c.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeleteProfileCommentButton(props: {
  username: string;
  commentId: number;
  onDeleted: () => void;
}): JSX.Element {
  const { username, commentId, onDeleted } = props;
  const [busy, setBusy] = useState(false);
  async function handle(): Promise<void> {
    if (!window.confirm("Delete this comment? This cannot be undone.")) return;
    setBusy(true);
    try {
      await deleteProfileComment(username, commentId);
      onDeleted();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={handle} disabled={busy} aria-label="Delete comment">
      delete
    </button>
  );
}

import { useState } from "react";
import { apiRequest } from "../lib/api";
import styles from "./VoteButton.module.css";

interface Props {
  commentId: number;
  votes: number;
  voted: boolean;
  disabled: boolean;
  onChange: (votes: number, voted: boolean) => void;
}

export function VoteButton({ commentId, votes, voted, disabled, onChange }: Props): JSX.Element {
  const [busy, setBusy] = useState(false);

  async function toggle(): Promise<void> {
    setBusy(true);
    try {
      const res = await apiRequest<{ votes: number }>(`/api/comments/${commentId}/vote`, {
        method: voted ? "DELETE" : "POST",
      });
      onChange(res.votes, !voted);
    } catch {
      // Surface via parent if needed; for now we just stop spinning.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`${styles.btn} ${voted ? styles.voted : ""}`}
      onClick={toggle}
      disabled={disabled || busy}
      aria-label={voted ? "remove upvote" : "upvote"}
      aria-pressed={voted}
    >
      <span aria-hidden="true">^</span>
      <span className={styles.count}>{votes}</span>
    </button>
  );
}

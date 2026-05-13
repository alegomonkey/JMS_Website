import { useState } from "react";
import { apiRequest } from "../lib/api";
import styles from "./DeleteCommentButton.module.css";

interface Props {
  commentId: number;
  onDeleted: () => void;
}

export function DeleteCommentButton({ commentId, onDeleted }: Props): JSX.Element {
  const [busy, setBusy] = useState(false);

  async function handle(): Promise<void> {
    const ok = window.confirm("Delete this comment? This cannot be undone.");
    if (!ok) return;
    setBusy(true);
    try {
      await apiRequest<void>(`/api/comments/${commentId}`, { method: "DELETE" });
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={styles.btn}
      onClick={handle}
      disabled={busy}
      aria-label="Delete comment (admin)"
    >
      delete
    </button>
  );
}

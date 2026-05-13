import { useState } from "react";
import { apiRequest } from "../lib/api";
import type { Comment } from "../lib/comments";

interface Props {
  projectSlug: string;
  onCreated: (comment: Comment) => void;
}

export function CommentForm({ projectSlug, onCreated }: Props): JSX.Element {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ comment: Comment }>(
        `/api/projects/${projectSlug}/comments`,
        { method: "POST", body: { body: trimmed } },
      );
      onCreated(res.comment);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="comment-body">Add a comment</label>
      <textarea
        id="comment-body"
        rows={3}
        maxLength={2000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={busy}
      />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy || body.trim().length === 0}>
        Post
      </button>
    </form>
  );
}

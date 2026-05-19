import { useState } from "react";
import { postProfileComment, type ProfileComment } from "../lib/profileComments";

interface Props {
  username: string;
  onCreated: (comment: ProfileComment) => void;
}

export function ProfileCommentForm({ username, onCreated }: Props): JSX.Element {
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
      const created = await postProfileComment(username, trimmed);
      onCreated(created);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="profile-comment-body">Leave a comment</label>
      <textarea
        id="profile-comment-body"
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

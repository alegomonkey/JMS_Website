import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function Register(): JSX.Element {
  useDocumentTitle("Register — JMS");
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = "register-error";

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Register</h1>
      <form onSubmit={submit} aria-describedby={error ? errorId : undefined}>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
          required
          minLength={3}
          maxLength={32}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <label htmlFor="password">Password (min 8)</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          required
          minLength={8}
          maxLength={128}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          Create account
        </button>
      </form>
      <p>
        Already have one? <a href="/signin">Sign in</a>.
      </p>
      <aside aria-labelledby="comment-policy">
        <h2 id="comment-policy">Comment policy</h2>
        <p>
          Creating an account lets you comment on projects and other people's
          profiles. Please <strong>be kind and keep comments on topic</strong>.
          Off-topic or hostile comments may be removed by the page owner or
          site admin.
        </p>
      </aside>
    </div>
  );
}

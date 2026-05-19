import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { OauthSection } from "../components/OauthSection";
import oauthStyles from "../components/OauthSection.module.css";

const OAUTH_ERROR_COPY: Record<string, string> = {
  oauth_state: "Sign-in via that provider was interrupted. Please try again.",
  oauth_code: "Sign-in via that provider was interrupted. Please try again.",
  oauth_exchange: "We couldn't reach that provider. Please try again.",
  oauth_unconfigured: "That sign-in method is not available right now.",
  login_required: "Please sign in first.",
};

export function SignIn(): JSX.Element {
  useDocumentTitle("Sign in — JMS");
  const { signIn, providersEnabled } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = "signin-error";

  const errCode = searchParams.get("err");
  const oauthError = errCode ? OAUTH_ERROR_COPY[errCode] ?? null : null;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Sign in</h1>
      {oauthError && (
        <p role="alert" className={oauthStyles.errorBanner}>
          {oauthError}
        </p>
      )}
      <form onSubmit={submit} aria-describedby={error ? errorId : undefined}>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          Sign in
        </button>
      </form>
      <OauthSection providersEnabled={providersEnabled} mode="signin" />
      <p>
        Need an account? <a href="/register">Register</a>.
      </p>
      <aside aria-labelledby="comment-policy">
        <h2 id="comment-policy">Comment policy</h2>
        <p>
          Signing in lets you comment on projects and other people's profiles.
          Please <strong>be kind and keep comments on topic</strong>. Off-topic
          or hostile comments may be removed by the page owner or site admin.
        </p>
      </aside>
    </div>
  );
}

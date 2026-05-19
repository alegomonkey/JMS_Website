import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest, type ApiError } from "../lib/api";
import { useAuth, type OauthProvider } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";

interface PendingResponse {
  pending: { provider: OauthProvider; suggestedUsername: string } | null;
}

const PROVIDER_LABEL: Record<OauthProvider, string> = {
  github: "GitHub",
  google: "Google",
};

export function AuthComplete(): JSX.Element {
  useDocumentTitle("Choose a username — JMS");
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [pending, setPending] = useState<PendingResponse["pending"]>(null);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<PendingResponse>("/api/auth/pending")
      .then((res) => {
        if (cancelled) return;
        if (!res.pending) {
          navigate("/signin", { replace: true });
          return;
        }
        setPending(res.pending);
        setUsername(res.pending.suggestedUsername);
      })
      .catch(() => {
        if (!cancelled) navigate("/signin", { replace: true });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const submit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        await apiRequest<{ user: unknown }>("/api/auth/oauth/complete", {
          method: "POST",
          body: { username },
        });
        await refresh();
        navigate("/", { replace: true });
      } catch (err) {
        const apiErr = err as ApiError;
        if (apiErr.status === 409) {
          setError("That username is taken. Try another.");
        } else if (apiErr.status === 400) {
          setError("Your sign-in attempt expired. Please start over.");
        } else {
          setError(apiErr.message || "Could not complete sign-up");
        }
      } finally {
        setBusy(false);
      }
    },
    [username, refresh, navigate],
  );

  if (loading) {
    return (
      <p role="status" aria-live="polite">
        Loading…
      </p>
    );
  }
  if (!pending) return <p>Redirecting…</p>;

  const errorId = "complete-error";
  return (
    <div>
      <h1>Choose a username</h1>
      <p>
        You signed in with <strong>{PROVIDER_LABEL[pending.provider]}</strong>.
        Pick the username you'd like to use on this site. You can edit the
        suggestion below.
      </p>
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
          pattern="[A-Za-z0-9_-]+"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <p>
          3–32 characters. Letters, digits, underscore, hyphen.
        </p>
        {error && (
          <p id={errorId} role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || username.length < 3}>
          Create account
        </button>
      </form>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest, type ApiError } from "../lib/api";
import { useAuth, type OauthProvider } from "../lib/auth";
import { useTheme } from "../theme/ThemeProvider";
import { usePrefs } from "../lib/prefs";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import oauthStyles from "../components/OauthSection.module.css";
import styles from "./Settings.module.css";

const PROVIDER_LABEL: Record<OauthProvider, string> = {
  github: "GitHub",
  google: "Google",
};

const ALL_PROVIDERS: OauthProvider[] = ["github", "google"];

const SETTINGS_BANNERS: Record<string, { tone: "ok" | "err"; text: string }> = {
  oauth_linked: { tone: "ok", text: "Provider linked to your account." },
  oauth_already_linked: {
    tone: "err",
    text: "That provider account is already linked to a different user.",
  },
  oauth_use_link: {
    tone: "err",
    text: "You're already signed in. Use the Connect buttons below to link another provider to your account.",
  },
  oauth_state: { tone: "err", text: "Linking was interrupted. Please try again." },
  oauth_code: { tone: "err", text: "Linking was interrupted. Please try again." },
  oauth_exchange: { tone: "err", text: "We couldn't reach that provider. Please try again." },
  oauth_unconfigured: { tone: "err", text: "That provider is not configured." },
};

export function Settings(): JSX.Element {
  useDocumentTitle("Settings — JMS");
  const { theme, toggle } = useTheme();
  const {
    user,
    signOut,
    providersEnabled,
    linkedProviders,
    refresh,
  } = useAuth();
  const { onScreenKeyboard, setOnScreenKeyboard } = usePrefs();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [unlinkBusy, setUnlinkBusy] = useState<OauthProvider | null>(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  // After a password login or after coming back from an OAuth link/unlink
  // redirect, ensure linkedProviders is current.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSignOut(): Promise<void> {
    await signOut();
    navigate("/");
  }

  const handleUnlink = useCallback(
    async (provider: OauthProvider): Promise<void> => {
      setUnlinkBusy(provider);
      setUnlinkError(null);
      try {
        await apiRequest<void>(`/api/auth/${provider}/unlink`, {
          method: "POST",
        });
        await refresh();
      } catch (err) {
        const apiErr = err as ApiError;
        setUnlinkError(apiErr.message || "Could not unlink");
      } finally {
        setUnlinkBusy(null);
      }
    },
    [refresh],
  );

  const isLight = theme === "light";
  const showConnectedAccounts =
    user && (providersEnabled.github || providersEnabled.google);

  const okCode = searchParams.get("ok");
  const errCode = searchParams.get("err");
  const banner =
    (okCode && SETTINGS_BANNERS[okCode]) ||
    (errCode && SETTINGS_BANNERS[errCode]) ||
    null;

  function dismissBanner(): void {
    const next = new URLSearchParams(searchParams);
    next.delete("ok");
    next.delete("err");
    setSearchParams(next, { replace: true });
  }

  return (
    <div>
      <h1>Settings</h1>

      {banner && (
        <p
          role={banner.tone === "err" ? "alert" : "status"}
          className={oauthStyles.errorBanner}
        >
          {banner.text}{" "}
          <button type="button" onClick={dismissBanner}>
            Dismiss
          </button>
        </p>
      )}

      <section aria-labelledby="theme-heading">
        <h2 id="theme-heading">Theme</h2>
        <label className={styles.toggle}>
          <span aria-hidden="true">Dark</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Use light mode"
            aria-checked={isLight}
            checked={isLight}
            onChange={toggle}
          />
          <span aria-hidden="true">Light</span>
        </label>
      </section>

      {user && (
        <section aria-labelledby="game-heading">
          <h2 id="game-heading">Cribbage game</h2>
          <label className={styles.toggle}>
            <span>On-screen keyboard off</span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Show on-screen number keyboard during the cribbage game"
              aria-checked={onScreenKeyboard}
              checked={onScreenKeyboard}
              onChange={(e) => setOnScreenKeyboard(e.target.checked)}
            />
            <span>On</span>
          </label>
        </section>
      )}

      {showConnectedAccounts && (
        <section aria-labelledby="connected-heading">
          <h2 id="connected-heading">Connected accounts</h2>
          <p>
            Link a GitHub or Google account so you can sign in with one click
            next time.
          </p>
          {unlinkError && (
            <p role="alert" className={oauthStyles.errorBanner}>
              {unlinkError}
            </p>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {ALL_PROVIDERS.filter((p) => providersEnabled[p]).map((p) => {
              const linked = linkedProviders.includes(p);
              const otherLinked = linkedProviders.some((x) => x !== p);
              const hasPasswordAuth = true; // /me doesn't expose this; rely on server-side guard
              const wouldLockOut = linked && !otherLinked && !hasPasswordAuth;
              // We can't tell from the client alone whether the user has a
              // password (the server doesn't expose password presence). The
              // server's unlink endpoint returns 409 with a clear message if
              // the unlink would lock them out, and the error banner surfaces it.
              return (
                <li
                  key={p}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.5rem 0",
                  }}
                >
                  <span style={{ minWidth: "5rem" }}>{PROVIDER_LABEL[p]}</span>
                  {linked ? (
                    <>
                      <span>Linked</span>
                      <button
                        type="button"
                        onClick={() => handleUnlink(p)}
                        disabled={unlinkBusy === p || wouldLockOut}
                        aria-describedby={
                          wouldLockOut ? `lockout-${p}` : undefined
                        }
                      >
                        {unlinkBusy === p ? "Unlinking…" : "Unlink"}
                      </button>
                      {wouldLockOut && (
                        <span id={`lockout-${p}`}>
                          (cannot unlink — this is your only sign-in method)
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span>Not linked</span>
                      <a
                        className={oauthStyles.button}
                        href={`/api/auth/${p}/link/start`}
                        style={{ padding: "0.4rem 0.75rem", minHeight: "2.25rem" }}
                      >
                        Connect {PROVIDER_LABEL[p]}
                      </a>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        {user ? (
          <div>
            <p>
              Signed in as <strong>{user.username}</strong>.
            </p>
            <button type="button" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        ) : (
          <div className={styles.actions}>
            <a href="/signin">Sign in</a>
            <a href="/register">Register</a>
          </div>
        )}
      </section>
    </div>
  );
}

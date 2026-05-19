import type { ProvidersEnabled } from "../lib/auth";
import styles from "./OauthSection.module.css";

interface OauthSectionProps {
  providersEnabled: ProvidersEnabled;
  // "signin" routes to /api/auth/<provider>/start
  // "link"   routes to /api/auth/<provider>/link/start (requires existing session)
  mode?: "signin" | "link";
}

const LABELS = {
  github: "Continue with GitHub",
  google: "Continue with Google",
} as const;

export function OauthSection({
  providersEnabled,
  mode = "signin",
}: OauthSectionProps): JSX.Element | null {
  const anyEnabled = providersEnabled.github || providersEnabled.google;
  if (!anyEnabled) return null;
  const path = (p: "github" | "google"): string =>
    mode === "link" ? `/api/auth/${p}/link/start` : `/api/auth/${p}/start`;
  return (
    <>
      <div className={styles.divider} role="separator" aria-label="or">
        <span>or</span>
      </div>
      <div className={styles.buttons}>
        {providersEnabled.github && (
          <a className={styles.button} href={path("github")}>
            {LABELS.github}
          </a>
        )}
        {providersEnabled.google && (
          <a className={styles.button} href={path("google")}>
            {LABELS.google}
          </a>
        )}
      </div>
    </>
  );
}

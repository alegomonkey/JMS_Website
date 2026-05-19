import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useTheme } from "../theme/ThemeProvider";
import { usePrefs } from "../lib/prefs";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import styles from "./Settings.module.css";

export function Settings(): JSX.Element {
  useDocumentTitle("Settings — JMS");
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const { onScreenKeyboard, setOnScreenKeyboard } = usePrefs();
  const navigate = useNavigate();

  async function handleSignOut(): Promise<void> {
    await signOut();
    navigate("/");
  }

  const isLight = theme === "light";

  return (
    <div>
      <h1>Settings</h1>

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

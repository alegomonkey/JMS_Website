import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useTheme } from "../theme/ThemeProvider";
import styles from "./Settings.module.css";

export function Settings(): JSX.Element {
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut(): Promise<void> {
    await signOut();
    navigate("/");
  }

  const isLight = theme === "light";

  return (
    <div>
      <h1>Settings</h1>

      <section>
        <h2>Theme</h2>
        <label className={styles.toggle}>
          <span>Dark</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Toggle light mode"
            checked={isLight}
            onChange={toggle}
          />
          <span>Light</span>
        </label>
      </section>

      <section>
        <h2>Account</h2>
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

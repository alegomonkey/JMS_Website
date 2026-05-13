import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import styles from "./NavBar.module.css";

export function NavBar(): JSX.Element {
  const { user } = useAuth();
  return (
    <nav className={styles.nav} aria-label="primary">
      <div className={styles.brand}>JMS</div>
      <ul className={styles.top}>
        <li>
          <NavLink to="/" end className={linkClass}>
            Home
          </NavLink>
        </li>
        <li>
          <NavLink to="/cv" className={linkClass}>
            CV
          </NavLink>
        </li>
      </ul>
      <div className={styles.spacer} />
      <ul className={styles.bottom}>
        <li>
          <NavLink to="/settings" className={linkClass} aria-label="Settings">
            <span className={styles.gear} aria-hidden="true">
              [*]
            </span>
            Settings
          </NavLink>
        </li>
        {user ? (
          <li className={styles.creds}>
            <span className={styles.user}>{user.username}</span>
          </li>
        ) : (
          <li className={styles.creds}>
            <NavLink to="/signin" className={linkClass}>
              Sign in
            </NavLink>
          </li>
        )}
      </ul>
    </nav>
  );
}

function linkClass({ isActive }: { isActive: boolean }): string {
  const base = styles.link ?? "";
  return isActive ? `${base} ${styles.linkActive ?? ""}` : base;
}

import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import styles from "./NavBar.module.css";

const MOBILE_QUERY = "(max-width: 47.99rem)";

export function NavBar(): JSX.Element {
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  });
  const [open, setOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const handle = (e: MediaQueryListEvent): void => {
      setIsMobile(e.matches);
      if (!e.matches) setOpen(false);
    };
    if (mql.addEventListener) mql.addEventListener("change", handle);
    else mql.addListener(handle);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handle);
      else mql.removeListener(handle);
    };
  }, []);

  // Close drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Scroll lock + focus management while open.
  useEffect(() => {
    if (!isMobile || !open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    // Focus the close button when the drawer opens.
    const id = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(id);
      hamburgerRef.current?.focus();
    };
  }, [isMobile, open]);

  const handleHamburgerClick = useCallback((): void => {
    setOpen((v) => !v);
  }, []);

  const handleBackdropClick = useCallback((): void => {
    setOpen(false);
  }, []);

  return (
    <>
      {isMobile && (
        <div className={styles.topbar}>
          <span className={styles.brandTop}>JMS</span>
          <button
            type="button"
            ref={hamburgerRef}
            onClick={handleHamburgerClick}
            aria-expanded={open}
            aria-controls="primary-nav"
            aria-label="Toggle navigation"
            className={styles.hamburger}
          >
            <span aria-hidden="true">{open ? "✕" : "☰"}</span>
          </button>
        </div>
      )}

      {isMobile && open && (
        <div
          className={styles.backdrop}
          aria-hidden="true"
          onClick={handleBackdropClick}
        />
      )}

      <nav
        id="primary-nav"
        ref={panelRef}
        className={`${styles.nav} ${isMobile ? styles.navMobile : ""} ${
          isMobile && open ? styles.navOpen : ""
        }`}
        aria-label="primary"
        aria-hidden={isMobile && !open ? true : undefined}
      >
        {isMobile && (
          <div className={styles.drawerHeader}>
            <span className={styles.brand}>JMS</span>
            <button
              type="button"
              ref={closeButtonRef}
              onClick={() => setOpen(false)}
              aria-label="Close navigation drawer"
              className={styles.close}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        )}
        {!isMobile && <div className={styles.brand}>JMS</div>}
        <ul className={styles.top}>
          <li>
            <NavLink to="/" end className={linkClass}>
              Home
            </NavLink>
          </li>
          <li>
            <NavLink to="/projects" className={linkClass}>
              Projects
            </NavLink>
          </li>
          <li>
            <NavLink to="/cribbage" className={linkClass}>
              Cribbage
            </NavLink>
          </li>
          <li>
            <NavLink to="/team-formation" className={linkClass}>
              Team Formation
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
              <NavLink to={`/profile/${encodeURIComponent(user.username)}`} className={linkClass}>
                <span className={styles.user}>{user.username}</span>
              </NavLink>
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
    </>
  );
}

function linkClass({ isActive }: { isActive: boolean }): string {
  const base = styles.link ?? "";
  return isActive ? `${base} ${styles.linkActive ?? ""}` : base;
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth.js";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { type TeamFormation, fetchSessions } from "../../lib/teamFormationApi.js";
import styles from "./TeamFormationPage.module.css";

type PageState =
  | { phase: "loading" }
  | { phase: "ready"; sessions: TeamFormation[] }
  | { phase: "error"; message: string };

const STATUS_LABEL: Record<TeamFormation["status"], string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
  formed: "Formed",
};

export function TeamFormationPage(): JSX.Element {
  useDocumentTitle("Team Formation — JMS");
  const { user, loading } = useAuth();

  if (loading) return <p className={styles.message}>Loading…</p>;

  if (!user) {
    return (
      <div>
        <h1>Team Formation</h1>
        <p>
          <Link to="/signin">Sign in</Link> to create and manage team formation sessions.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <section className={styles.intro} aria-labelledby="tf-intro-heading">
        <h1 id="tf-intro-heading">Team Formation</h1>
        <p>
          Build balanced teams from survey responses. Create a session, attach a survey, share
          an invite code, and run the algorithm once responses are in.
        </p>

        <h2 className={styles.modesHeading}>Submission modes</h2>
        <div className={styles.modes}>
          <div className={styles.modeCard}>
            <h3>Numbered</h3>
            <p>
              Participants receive an automatically assigned submission number. No setup required.
              The system does <strong>not</strong> prevent the same person from submitting more
              than once — duplicate submissions are the manager&apos;s responsibility to identify.
            </p>
          </div>
          <div className={styles.modeCard}>
            <h3>Named</h3>
            <p>
              You enter a name for each participant before launching. Participants select their name
              from the list. The system does <strong>not</strong> verify identity or prevent
              someone selecting the wrong name or submitting under multiple names — duplicate
              handling is the manager&apos;s responsibility.
            </p>
          </div>
        </div>

        <Link to="/team-formation/new" className={styles.createBtn}>
          Create New Session
        </Link>
      </section>

      <section aria-labelledby="tf-sessions-heading">
        <h2 id="tf-sessions-heading">Your Sessions</h2>
        <SessionDashboard />
      </section>
    </div>
  );
}

function SessionDashboard(): JSX.Element {
  const [state, setState] = useState<PageState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchSessions()
      .then(({ sessions }) => {
        if (!cancelled) setState({ phase: "ready", sessions });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load sessions";
          setState({ phase: "error", message: msg });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === "loading") return <p className={styles.message}>Loading sessions…</p>;
  if (state.phase === "error") {
    return (
      <p className={styles.message} role="alert">
        {state.message}
      </p>
    );
  }

  if (state.sessions.length === 0) {
    return (
      <p className={styles.empty}>
        No sessions yet.{" "}
        <Link to="/team-formation/new">Create your first.</Link>
      </p>
    );
  }

  return (
    <div className={styles.grid}>
      {state.sessions.map((s) => (
        <SessionCard key={s.id} session={s} />
      ))}
    </div>
  );
}

function SessionCard({ session: s }: { session: TeamFormation }): JSX.Element {
  const headingId = `session-card-${s.id}`;
  const inviteUrl = `${window.location.origin}/team-formation/join?code=${s.invite_code}`;

  async function copyInvite(): Promise<void> {
    await navigator.clipboard.writeText(inviteUrl);
  }

  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <div className={styles.cardHeader}>
        <h3 id={headingId} className={styles.cardTitle}>
          {s.status === "draft" ? (
            <Link to={`/team-formation/${s.id}/edit`}>{s.title}</Link>
          ) : (
            s.title
          )}
        </h3>
        <div className={styles.badges}>
          <span className={`${styles.badge} ${styles[`badgeMode${s.slot_mode}`]}`}>
            {s.slot_mode === "numbered" ? "Numbered" : "Named"}
          </span>
          <span className={`${styles.badge} ${styles[`badgeStatus${s.status}`]}`}>
            {STATUS_LABEL[s.status]}
          </span>
        </div>
      </div>

      <p className={styles.cardCount}>
        {s.slots_submitted} of {s.slot_count} submitted
      </p>

      <div className={styles.cardActions}>
        {s.status === "draft" && (
          <Link to={`/team-formation/${s.id}/edit`} className={styles.actionLink}>
            Edit
          </Link>
        )}
        {s.status !== "draft" && (
          <button type="button" className={styles.actionBtn} onClick={() => void copyInvite()}>
            Copy invite link
          </button>
        )}
        {(s.status === "closed" || s.status === "formed") && (
          <Link to={`/team-formation/${s.id}/results`} className={styles.actionLink}>
            View Results
          </Link>
        )}
      </div>
    </article>
  );
}

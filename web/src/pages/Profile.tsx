import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import {
  fetchProfile,
  fetchRecentGames,
  updateBio,
  type ProfileSnapshot,
  type RecentGame,
} from "../lib/cribbageApi";
import {
  fetchProfileComments,
  type ProfileComment,
} from "../lib/profileComments";
import { ProfileCommentForm } from "../components/ProfileCommentForm";
import { ProfileCommentList } from "../components/ProfileCommentList";
import styles from "./Profile.module.css";

type ProfileState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; profile: ProfileSnapshot }
  | { status: "error"; message: string };

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  return `${m}m ${s.toFixed(1)}s`;
}

export function Profile(): JSX.Element {
  const { username = "" } = useParams<{ username: string }>();
  const { user: viewer } = useAuth();
  const [state, setState] = useState<ProfileState>({ status: "loading" });
  const [games, setGames] = useState<RecentGame[]>([]);
  const [comments, setComments] = useState<ProfileComment[]>([]);
  const [bioDraft, setBioDraft] = useState("");
  const [editingBio, setEditingBio] = useState(false);
  const [bioSaving, setBioSaving] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  useDocumentTitle(
    state.status === "ready" ? `${state.profile.user.username} — JMS` : "Profile — JMS",
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const snapshot = await fetchProfile(username);
      setState({ status: "ready", profile: snapshot });
      setBioDraft(snapshot.user.bio);
      const [g, c] = await Promise.all([
        fetchRecentGames(username).catch(() => []),
        fetchProfileComments(username).catch(() => []),
      ]);
      setGames(g);
      setComments(c);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        setState({ status: "missing" });
      } else {
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "failed to load profile",
        });
      }
    }
  }, [username]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <p role="status" aria-live="polite">
        Loading profile…
      </p>
    );
  }

  if (state.status === "missing") {
    return (
      <div className={styles.missing} aria-live="polite">
        <h1>No such account</h1>
        <p>
          There is no JMS account with the username <strong>{username}</strong>.
        </p>
        <p>
          <Link to="/" className={styles.homeLink}>
            ← Back to home
          </Link>
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div>
        <h1>Profile</h1>
        <p role="alert">{state.message}</p>
      </div>
    );
  }

  const { profile } = state;
  const isOwner = viewer?.username.toLowerCase() === profile.user.username.toLowerCase();
  const canDeleteComments = isOwner || viewer?.role === "admin";

  async function saveBio(): Promise<void> {
    setBioSaving(true);
    setBioError(null);
    try {
      const saved = await updateBio(bioDraft);
      setState((s) =>
        s.status === "ready"
          ? { ...s, profile: { ...s.profile, user: { ...s.profile.user, bio: saved } } }
          : s,
      );
      setEditingBio(false);
    } catch (err) {
      setBioError(err instanceof Error ? err.message : "could not save bio");
    } finally {
      setBioSaving(false);
    }
  }

  return (
    <div>
      <header className={styles.header}>
        <h1>{profile.user.username}</h1>
        <p className={styles.joined}>
          Joined {new Date(profile.user.created_at * 1000).toLocaleDateString()}
        </p>
      </header>

      <section aria-labelledby="bio-heading" className={styles.bioSection}>
        <h2 id="bio-heading">About</h2>
        {isOwner && editingBio ? (
          <div>
            <textarea
              rows={4}
              maxLength={500}
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value)}
              disabled={bioSaving}
              aria-label="Edit bio"
            />
            <div className={styles.bioActions}>
              <button type="button" onClick={() => void saveBio()} disabled={bioSaving}>
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingBio(false);
                  setBioDraft(profile.user.bio);
                  setBioError(null);
                }}
                disabled={bioSaving}
              >
                Cancel
              </button>
            </div>
            {bioError && <p role="alert">{bioError}</p>}
          </div>
        ) : (
          <div>
            <p className={styles.bioText}>
              {profile.user.bio || (isOwner ? "(No bio yet — click Edit to add one.)" : "(No bio.)")}
            </p>
            {isOwner && (
              <button type="button" onClick={() => setEditingBio(true)}>
                Edit bio
              </button>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="best-heading">
        <h2 id="best-heading">Cribbage best times</h2>
        <table className={styles.bestTable}>
          <thead>
            <tr>
              <th scope="col">Length</th>
              <th scope="col">Best time</th>
              <th scope="col">Mistakes</th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {(["5", "20", "100"] as const).map((k) => {
              const b = profile.bestTimes[k];
              return (
                <tr key={k}>
                  <td>{k} hands</td>
                  <td>{b ? formatMs(b.total_ms) : "—"}</td>
                  <td>{b ? b.mistakes : "—"}</td>
                  <td>{b ? new Date(b.created_at * 1000).toLocaleDateString() : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {games.length > 0 && (
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading">Recent games</h2>
          <table className={styles.gamesTable}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Length</th>
                <th scope="col">Time</th>
                <th scope="col">Mistakes</th>
                <th scope="col">Hands seen</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td>{new Date(g.created_at * 1000).toLocaleString()}</td>
                  <td>{g.round_count}</td>
                  <td>{formatMs(g.total_ms)}</td>
                  <td>{g.mistakes}</td>
                  <td>
                    <pre className={styles.handsShort}>{g.hands_short}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section aria-labelledby="comments-heading">
        <h2 id="comments-heading">Comments</h2>
        {viewer ? (
          <ProfileCommentForm
            username={profile.user.username}
            onCreated={(c) => setComments((prev) => [c, ...prev])}
          />
        ) : (
          <p>
            <Link to="/signin">Sign in</Link> to leave a comment.
          </p>
        )}
        <ProfileCommentList
          username={profile.user.username}
          comments={comments}
          canDelete={Boolean(canDeleteComments)}
          onDeleted={(id) => setComments((prev) => prev.filter((c) => c.id !== id))}
        />
      </section>
    </div>
  );
}

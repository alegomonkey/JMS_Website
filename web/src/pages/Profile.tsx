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
import { formatMs } from "../lib/formatMs";
import styles from "./Profile.module.css";

type ProfileState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; profile: ProfileSnapshot }
  | { status: "error"; message: string };

type StatsTab = "daily" | "overall" | "recent";

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
  const [tab, setTab] = useState<StatsTab>("daily");

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

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className={styles.srOnly}>
          Stats
        </h2>
        <div className={styles.tabsRow}>
          <div role="tablist" aria-label="Stats" className={styles.tabs}>
            <button
              type="button"
              role="tab"
              id="tab-daily"
              aria-selected={tab === "daily"}
              aria-controls="tabpanel-daily"
              onClick={() => setTab("daily")}
              className={tab === "daily" ? styles.active : ""}
            >
              Best daily
            </button>
            <button
              type="button"
              role="tab"
              id="tab-overall"
              aria-selected={tab === "overall"}
              aria-controls="tabpanel-overall"
              onClick={() => setTab("overall")}
              className={tab === "overall" ? styles.active : ""}
            >
              Best overall
            </button>
            <button
              type="button"
              role="tab"
              id="tab-recent"
              aria-selected={tab === "recent"}
              aria-controls="tabpanel-recent"
              onClick={() => setTab("recent")}
              className={tab === "recent" ? styles.active : ""}
            >
              Recent games
            </button>
          </div>
          <Link
            to={`/profile/${encodeURIComponent(profile.user.username)}/chart`}
            className={styles.chartLink}
          >
            Improvement chart →
          </Link>
        </div>

        {tab === "daily" && (
          <div
            role="tabpanel"
            id="tabpanel-daily"
            aria-labelledby="tab-daily"
          >
            <table className={styles.bestTable}>
              <thead>
                <tr>
                  <th scope="col">Length</th>
                  <th scope="col">Best time</th>
                  <th scope="col">Time added</th>
                  <th scope="col">Daily date</th>
                  <th scope="col" className={styles.viewCol}>
                    <span className={styles.srOnly}>View game</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(["5", "20", "100"] as const).map((k) => {
                  const b = profile.bestDaily[k];
                  return (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{b ? formatMs(b.total_ms) : "—"}</td>
                      <td>{b ? `${b.mistakes * 3}s` : "—"}</td>
                      <td>{b ? b.daily_date : "—"}</td>
                      <td className={styles.viewCol}>
                        {b ? (
                          <Link
                            to={`/cribbage/games/${b.game_id}`}
                            aria-label={`View ${k}-hand best daily game`}
                            className={styles.viewLink}
                          >
                            ›
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === "overall" && (
          <div
            role="tabpanel"
            id="tabpanel-overall"
            aria-labelledby="tab-overall"
          >
            <table className={styles.bestTable}>
              <thead>
                <tr>
                  <th scope="col">Length</th>
                  <th scope="col">Best time</th>
                  <th scope="col">Time added</th>
                  <th scope="col">Source</th>
                  <th scope="col">When</th>
                  <th scope="col" className={styles.viewCol}>
                    <span className={styles.srOnly}>View game</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(["5", "20", "100"] as const).map((k) => {
                  const b = profile.bestTimes[k];
                  return (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{b ? formatMs(b.total_ms) : "—"}</td>
                      <td>{b ? `${b.mistakes * 3}s` : "—"}</td>
                      <td>
                        {b ? (
                          <span className={b.is_daily ? styles.badgeDaily : styles.badgeFreeplay}>
                            {b.is_daily ? "Daily" : "Free-play"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{b ? new Date(b.created_at * 1000).toLocaleDateString() : "—"}</td>
                      <td className={styles.viewCol}>
                        {b && b.game_id != null ? (
                          <Link
                            to={`/cribbage/games/${b.game_id}`}
                            aria-label={`View ${k}-hand best overall game`}
                            className={styles.viewLink}
                          >
                            ›
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === "recent" && (
          <div
            role="tabpanel"
            id="tabpanel-recent"
            aria-labelledby="tab-recent"
          >
            {games.length === 0 ? (
              <p>No recent games yet.</p>
            ) : (
              <table className={styles.gamesTable}>
                <thead>
                  <tr>
                    <th scope="col">Length</th>
                    <th scope="col">Time</th>
                    <th scope="col">Date</th>
                    <th scope="col" className={styles.viewCol}>
                      <span className={styles.srOnly}>View game</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => (
                    <tr key={g.id}>
                      <td>{g.round_count}</td>
                      <td>{formatMs(g.total_ms)}</td>
                      <td>{new Date(g.created_at * 1000).toLocaleDateString()}</td>
                      <td className={styles.viewCol}>
                        <Link
                          to={`/cribbage/games/${g.id}`}
                          aria-label={`View game from ${new Date(g.created_at * 1000).toLocaleString()}`}
                          className={styles.viewLink}
                        >
                          ›
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

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

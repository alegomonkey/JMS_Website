import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import {
  fetchAllTimeLeaderboard,
  fetchDailyLeaderboard,
  type LeaderboardEntry,
  type RoundCount,
} from "../../lib/cribbageApi";
import { DailyCountdown } from "../../components/DailyCountdown";
import { formatMs } from "../../lib/formatMs";
import styles from "./CribbageRecords.module.css";

const ROUNDS: RoundCount[] = [5, 20, 100];

type View = "daily" | "alltime";

export function CribbageRecords(): JSX.Element {
  useDocumentTitle("Cribbage records — JMS");
  const { user: viewer } = useAuth();
  const [tab, setTab] = useState<RoundCount>(5);
  const [view, setView] = useState<View>("daily");
  const [date, setDate] = useState<string>("");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (round: RoundCount, which: View) => {
    setLoading(true);
    setError(null);
    try {
      if (which === "daily") {
        const { date: d, entries: rows } = await fetchDailyLeaderboard(round);
        setDate(d);
        setEntries(rows);
      } else {
        const { entries: rows } = await fetchAllTimeLeaderboard(round);
        setDate("");
        setEntries(rows);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab, view);
  }, [tab, view, load]);

  return (
    <div>
      <header className={styles.header}>
        <div className={styles.headerCol}>
          <p>
            <Link to="/cribbage">← Back to start</Link>
          </p>
          <h1>{view === "daily" ? "Today's daily records" : "All-time records"}</h1>
        </div>
        <div className={styles.headerColRight}>
          {viewer && (
            <p>
              <Link to={`/profile/${encodeURIComponent(viewer.username)}`}>
                Your records →
              </Link>
            </p>
          )}
          {view === "daily" && (
            <DailyCountdown onRollover={() => void load(tab, view)} />
          )}
        </div>
      </header>

      <p>
        {view === "daily"
          ? `Best times for ${date || "today"}'s seeded daily challenge.`
          : "Fastest completed runs of all time, across everyone."}
      </p>

      <label className={styles.viewToggle}>
        <span aria-hidden="true">Today's daily</span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Switch between today's daily leaderboard and all-time records"
          aria-checked={view === "alltime"}
          checked={view === "alltime"}
          onChange={(e) => setView(e.target.checked ? "alltime" : "daily")}
        />
        <span aria-hidden="true">All time</span>
      </label>

      <div role="tablist" aria-label="Hand count" className={styles.tabs}>
        {ROUNDS.map((n) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={tab === n}
            aria-controls={`tabpanel-${n}`}
            id={`tab-${n}`}
            onClick={() => setTab(n)}
            className={tab === n ? styles.active : ""}
          >
            {n} hands
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {error && <p role="alert">{error}</p>}
        {loading ? (
          <p role="status" aria-live="polite">
            Loading leaderboard…
          </p>
        ) : entries.length === 0 ? (
          <p>
            {view === "daily"
              ? `Nobody's completed today's ${tab}-hand daily yet. Be the first.`
              : `No completed ${tab}-hand runs yet.`}
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Time</th>
                <th scope="col">{view === "daily" ? "Played" : "Date"}</th>
                {view === "alltime" && <th scope="col">Source</th>}
                <th scope="col" className={styles.viewCol}>
                  <span className={styles.srOnly}>View game</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.id}`}>
                  <td>{e.rank}</td>
                  <td>
                    <Link to={`/profile/${encodeURIComponent(e.username)}`}>
                      {e.username}
                    </Link>
                  </td>
                  <td>{formatMs(e.total_ms)}</td>
                  <td>
                    {view === "daily"
                      ? new Date(e.created_at * 1000).toLocaleTimeString()
                      : new Date(e.created_at * 1000).toLocaleDateString()}
                  </td>
                  {view === "alltime" && (
                    <td>
                      <span
                        className={
                          e.daily_date ? styles.badgeDaily : styles.badgeFreeplay
                        }
                      >
                        {e.daily_date ? "Daily" : "Free-play"}
                      </span>
                    </td>
                  )}
                  <td className={styles.viewCol}>
                    <Link
                      to={`/cribbage/games/${e.id}`}
                      aria-label={`View ${e.username}'s game`}
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
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import {
  fetchDailyLeaderboard,
  type LeaderboardEntry,
  type RoundCount,
} from "../../lib/cribbageApi";
import { DailyCountdown } from "../../components/DailyCountdown";
import styles from "./CribbageRecords.module.css";

const ROUNDS: RoundCount[] = [5, 20, 100];

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  return `${m}m ${s.toFixed(1)}s`;
}

export function CribbageRecords(): JSX.Element {
  useDocumentTitle("Cribbage records — JMS");
  const [tab, setTab] = useState<RoundCount>(5);
  const [date, setDate] = useState<string>("");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (round: RoundCount) => {
    setLoading(true);
    setError(null);
    try {
      const { date: d, entries: rows } = await fetchDailyLeaderboard(round);
      setDate(d);
      setEntries(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  return (
    <div>
      <p>
        <Link to="/cribbage">← Back to start</Link>
      </p>
      <header className={styles.header}>
        <h1>Today's daily records</h1>
        <DailyCountdown onRollover={() => void load(tab)} />
      </header>
      <p>Best times for {date || "today"}'s seeded daily challenge.</p>

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
          <p>Nobody's completed today's {tab}-hand daily yet. Be the first.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Time</th>
                <th scope="col">Date</th>
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
                    <Link to={`/profile/${encodeURIComponent(e.username)}`}>{e.username}</Link>
                  </td>
                  <td>{formatMs(e.total_ms)}</td>
                  <td>{new Date(e.created_at * 1000).toLocaleTimeString()}</td>
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

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { fetchLeaderboard, type LeaderboardEntry, type RoundCount } from "../../lib/cribbageApi";
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
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchLeaderboard(tab)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <div>
      <p>
        <Link to="/cribbage">← Back to start</Link>
      </p>
      <h1>Records</h1>
      <p>Best times per round length, across all players.</p>

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
          <p role="status" aria-live="polite">Loading leaderboard…</p>
        ) : entries.length === 0 ? (
          <p>No records yet for this length.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Time</th>
                <th scope="col">Mistakes</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.username}-${e.created_at}`}>
                  <td>{e.rank}</td>
                  <td>
                    <Link to={`/profile/${encodeURIComponent(e.username)}`}>{e.username}</Link>
                  </td>
                  <td>{formatMs(e.total_ms)}</td>
                  <td>{e.mistakes}</td>
                  <td>{new Date(e.created_at * 1000).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { fetchRecentGames, type RecentGame, type RoundCount } from "../../lib/cribbageApi";
import { formatMs } from "../../lib/formatMs";
import styles from "./CribbageImprovementChart.module.css";

const ROUNDS: RoundCount[] = [5, 20, 100];

const WIDTH = 640;
const HEIGHT = 320;
const PAD = { top: 20, right: 20, bottom: 40, left: 64 };
const INNER_W = WIDTH - PAD.left - PAD.right;
const INNER_H = HEIGHT - PAD.top - PAD.bottom;

function parseRounds(raw: string | null): RoundCount {
  if (raw === "20") return 20;
  if (raw === "100") return 100;
  return 5;
}

export function CribbageImprovementChart(): JSX.Element {
  const { username = "" } = useParams<{ username: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const rounds = parseRounds(searchParams.get("rounds"));
  const navigate = useNavigate();

  const [games, setGames] = useState<RecentGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(`${username}'s improvement — JMS`);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const g = await fetchRecentGames(username, {
        roundCount: rounds,
        limit: 1000,
        completedOnly: true,
      });
      setGames(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load games");
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [username, rounds]);

  useEffect(() => {
    void load();
  }, [load]);

  function setRounds(n: RoundCount): void {
    const next = new URLSearchParams(searchParams);
    next.set("rounds", String(n));
    setSearchParams(next);
  }

  // Oldest → newest for the chart's x-axis.
  const ascending = useMemo(
    () => [...games].sort((a, b) => a.created_at - b.created_at),
    [games],
  );

  const profileLink = `/profile/${encodeURIComponent(username)}`;

  return (
    <div>
      <p>
        <Link to={profileLink}>← Back to {username}'s profile</Link>
      </p>
      <h1>{username}'s improvement</h1>
      <p>Every completed run, oldest to newest. Lower is faster. Tap a point to view that game.</p>

      <div role="tablist" aria-label="Hand count" className={styles.tabs}>
        {ROUNDS.map((n) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={rounds === n}
            id={`tab-${n}`}
            onClick={() => setRounds(n)}
            className={rounds === n ? styles.active : ""}
          >
            {n} hands
          </button>
        ))}
      </div>

      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status" aria-live="polite">
          Loading games…
        </p>
      ) : ascending.length === 0 ? (
        <p>No completed {rounds}-hand runs yet. Play one and your trajectory appears here.</p>
      ) : (
        <>
          <Chart games={ascending} onPick={(id) => navigate(`/cribbage/games/${id}`)} />
          <GamesTable games={games} />
        </>
      )}
    </div>
  );
}

function Chart({
  games,
  onPick,
}: {
  games: RecentGame[];
  onPick: (id: number) => void;
}): JSX.Element {
  const xs = games.map((g) => g.created_at);
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  if (xMin === xMax) {
    // All on the same instant: pad ±1h so the point isn't on the axis edge.
    xMin -= 3600;
    xMax += 3600;
  }
  const yMax = Math.max(...games.map((g) => g.total_ms)) * 1.05 || 1;

  const xPx = (t: number): number => PAD.left + ((t - xMin) / (xMax - xMin)) * INNER_W;
  const yPx = (ms: number): number => PAD.top + (1 - ms / yMax) * INNER_H;

  const polyline = games.map((g) => `${xPx(g.created_at)},${yPx(g.total_ms)}`).join(" ");

  // Y ticks: 5 evenly spaced.
  const yTicks = Array.from({ length: 5 }, (_, i) => (yMax * i) / 4);
  // X ticks: first, middle, last.
  const xTickTimes =
    games.length === 1
      ? [games[0]!.created_at]
      : [xMin, (xMin + xMax) / 2, xMax];

  return (
    <div className={styles.chartWrap}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={styles.svg}
        role="img"
        aria-label={`Line chart of completed game times over time; ${games.length} games. Full data in the table below.`}
      >
        {/* Y grid + labels */}
        {yTicks.map((ms, i) => (
          <g key={`y-${i}`}>
            <line
              x1={PAD.left}
              y1={yPx(ms)}
              x2={WIDTH - PAD.right}
              y2={yPx(ms)}
              className={styles.grid}
            />
            <text x={PAD.left - 8} y={yPx(ms) + 4} textAnchor="end" className={styles.axisText}>
              {formatMs(ms)}
            </text>
          </g>
        ))}

        {/* X axis line */}
        <line
          x1={PAD.left}
          y1={PAD.top + INNER_H}
          x2={WIDTH - PAD.right}
          y2={PAD.top + INNER_H}
          className={styles.axis}
        />
        {/* Y axis line */}
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={PAD.top + INNER_H}
          className={styles.axis}
        />

        {/* X labels */}
        {xTickTimes.map((t, i) => (
          <text
            key={`x-${i}`}
            x={xPx(t)}
            y={PAD.top + INNER_H + 24}
            textAnchor={i === 0 ? "start" : i === xTickTimes.length - 1 ? "end" : "middle"}
            className={styles.axisText}
          >
            {new Date(t * 1000).toLocaleDateString()}
          </text>
        ))}

        {/* Series line (skip when a single point) */}
        {games.length > 1 && (
          <polyline points={polyline} className={styles.line} />
        )}

        {/* Points */}
        {games.map((g) => {
          const cx = xPx(g.created_at);
          const cy = yPx(g.total_ms);
          const label = `${new Date(g.created_at * 1000).toLocaleDateString()} — ${formatMs(
            g.total_ms,
          )} — ${g.daily_date ? "daily" : "free-play"}. View game.`;
          return (
            <g
              key={g.id}
              tabIndex={0}
              role="button"
              aria-label={label}
              className={styles.pointHit}
              onClick={() => onPick(g.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick(g.id);
                }
              }}
            >
              <title>{label}</title>
              {/* larger invisible hit target for touch */}
              <circle cx={cx} cy={cy} r={12} className={styles.hit} />
              <circle cx={cx} cy={cy} r={5} className={styles.point} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function GamesTable({ games }: { games: RecentGame[] }): JSX.Element {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Time</th>
          <th scope="col">Date</th>
          <th scope="col">Source</th>
          <th scope="col" className={styles.viewCol}>
            <span className={styles.srOnly}>View game</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {games.map((g, i) => (
          <tr key={g.id}>
            <td>{i + 1}</td>
            <td>{formatMs(g.total_ms)}</td>
            <td>{new Date(g.created_at * 1000).toLocaleDateString()}</td>
            <td>
              <span className={g.daily_date ? styles.badgeDaily : styles.badgeFreeplay}>
                {g.daily_date ? "Daily" : "Free-play"}
              </span>
            </td>
            <td className={styles.viewCol}>
              <Link
                to={`/cribbage/games/${g.id}`}
                aria-label={`View game ${i + 1}`}
                className={styles.viewLink}
              >
                ›
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { fetchGame, type GameDetail, type GameHand } from "../../lib/cribbageApi";
import styles from "./CribbageGameDetail.module.css";

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  return `${m}m ${s.toFixed(1)}s`;
}

const RANK_SHORT: Record<string, string> = {
  A: "A",
  "10": "10",
  J: "J",
  Q: "Q",
  K: "K",
};

function shortenCard(card: string): string {
  const idx = card.indexOf("_");
  if (idx < 0) return card;
  const suit = card.slice(0, idx);
  const rank = card.slice(idx + 1);
  const r = RANK_SHORT[rank] ?? rank;
  return `${r}${suit[0]!.toUpperCase()}`;
}

function livesLostCell(attempts: number): string {
  const lost = Math.max(0, attempts - 1);
  return lost === 0 ? "—" : String(lost);
}

type State =
  | { status: "loading" }
  | { status: "ready"; game: GameDetail }
  | { status: "missing" }
  | { status: "error"; message: string };

export function CribbageGameDetail(): JSX.Element {
  const { id = "" } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ status: "loading" });

  useDocumentTitle(
    state.status === "ready"
      ? `${state.game.username} · ${state.game.round_count}-hand game — JMS`
      : "Game — JMS",
  );

  const load = useCallback(async () => {
    const gameId = Number(id);
    if (!Number.isFinite(gameId) || gameId <= 0) {
      setState({ status: "missing" });
      return;
    }
    setState({ status: "loading" });
    try {
      const game = await fetchGame(gameId);
      setState({ status: "ready", game });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        setState({ status: "missing" });
      } else {
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "failed to load game",
        });
      }
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <p role="status" aria-live="polite">
        Loading game…
      </p>
    );
  }

  if (state.status === "missing") {
    return (
      <div>
        <p>
          <Link to="/cribbage/records">← Back to records</Link>
        </p>
        <h1>Game not found</h1>
        <p>This game record does not exist or has been removed.</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div>
        <p>
          <Link to="/cribbage/records">← Back to records</Link>
        </p>
        <h1>Game</h1>
        <p role="alert">{state.message}</p>
      </div>
    );
  }

  const { game } = state;
  const sourceLabel = game.daily_date ? `Daily ${game.daily_date}` : "Free-play";
  const statusLabel = game.completed ? "Completed" : "Did not finish";

  return (
    <div>
      <p>
        <Link to="/cribbage/records">← Back to records</Link>
      </p>
      <header className={styles.header}>
        <h1>
          <Link to={`/profile/${encodeURIComponent(game.username)}`}>
            {game.username}
          </Link>{" "}
          · {game.round_count}-hand {game.daily_date ? "daily" : "free-play"}
        </h1>
      </header>

      <dl className={styles.stats}>
        <div>
          <dt>Total time</dt>
          <dd>{formatMs(game.total_ms)}</dd>
        </div>
        <div>
          <dt>Lives lost</dt>
          <dd>{game.mistakes}</dd>
        </div>
        <div>
          <dt>Hands played</dt>
          <dd>
            {game.hands.length} / {game.round_count}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{sourceLabel}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{statusLabel}</dd>
        </div>
        <div>
          <dt>Played</dt>
          <dd>{new Date(game.created_at * 1000).toLocaleString()}</dd>
        </div>
      </dl>

      <h2>Hands</h2>
      {game.hands.length === 0 ? (
        <p>No hands recorded for this game.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Hand</th>
                <th scope="col">Cut</th>
                <th scope="col">Score</th>
                <th scope="col">Time</th>
                <th scope="col">Lives lost</th>
              </tr>
            </thead>
            <tbody>
              {game.hands.map((h: GameHand, i: number) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className={styles.cards}>
                    {h.cards.map(shortenCard).join(" ")}
                  </td>
                  <td className={styles.cards}>{shortenCard(h.cut)}</td>
                  <td>{h.correct}</td>
                  <td>{formatMs(h.time_ms)}</td>
                  <td>{livesLostCell(h.attempts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

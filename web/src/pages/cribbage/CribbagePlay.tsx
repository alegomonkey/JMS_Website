import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { usePrefs } from "../../lib/prefs";
import {
  dealHands,
  scoreHand,
  seededDailyRng,
  todayEt,
  type DealtHand,
} from "../../lib/cribbage";
import {
  submitGame,
  type RoundCount,
  type SavedGame,
  type SubmittedHand,
} from "../../lib/cribbageApi";
import { PlayingCard } from "../../components/PlayingCard";
import { OnScreenKeyboard } from "../../components/OnScreenKeyboard";
import styles from "./CribbagePlay.module.css";

const MOBILE_QUERY = "(max-width: 47.99rem)";
const MISTAKE_PENALTY_MS = 3000;

function parseRounds(raw: string | null): RoundCount | null {
  if (raw === "5") return 5;
  if (raw === "20") return 20;
  if (raw === "100") return 100;
  return null;
}

type Mode = "freeplay" | "daily";

function parseMode(raw: string | null): Mode {
  return raw === "daily" ? "daily" : "freeplay";
}

interface HandResult {
  cards: string[];
  cut: string;
  attempts: number;
  time_ms: number;
  correct: number;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const handle = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    if (mql.addEventListener) mql.addEventListener("change", handle);
    else mql.addListener(handle);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handle);
      else mql.removeListener(handle);
    };
  }, []);
  return isMobile;
}

export function CribbagePlay(): JSX.Element {
  const [params] = useSearchParams();
  const rounds = parseRounds(params.get("rounds"));
  const mode = parseMode(params.get("mode"));

  useDocumentTitle("Cribbage round — JMS");
  const { user } = useAuth();
  const { onScreenKeyboard: oskPref } = usePrefs();
  const isMobile = useIsMobile();
  const showOsk = isMobile || oskPref;
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Hand sequence — deterministic on daily, random on free-play.
  const today = useMemo(() => todayEt(), []);
  const hands = useMemo<DealtHand[] | null>(() => {
    if (!rounds) return null;
    if (mode === "daily") return dealHands(rounds, seededDailyRng(today, rounds));
    return dealHands(rounds);
  }, [rounds, mode, today]);

  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [attempts, setAttempts] = useState(1);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [feedback, setFeedback] = useState<"" | "wrong">("");
  const [results, setResults] = useState<HandResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finalGame, setFinalGame] = useState<SavedGame | null>(null);
  const [guestSummary, setGuestSummary] = useState<{
    total_ms: number;
    mistake_count: number;
  } | null>(null);
  const handStartRef = useRef<number>(Date.now());
  const gameStartRef = useRef<number>(Date.now());
  const [, forceTick] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    handStartRef.current = Date.now();
    setValue("");
    setAttempts(1);
    setFeedback("");
  }, [index]);

  // Live game-timer tick. Re-renders the header clock ~10×/sec while the
  // game is in progress. Stops once the run is over (finalGame / guestSummary).
  const showLiveTimer = !finalGame && !guestSummary && !submitting;
  useEffect(() => {
    if (!showLiveTimer) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [showLiveTimer]);

  const finishGame = useCallback(
    async (final: HandResult[], completed: boolean) => {
      if (!rounds) return;
      const rawTotalMs = final.reduce((acc, h) => acc + h.time_ms, 0);
      const handMistakes = final.reduce(
        (acc, h) => acc + Math.max(0, h.attempts - 1),
        0,
      );
      const effectiveTotalMs = rawTotalMs + handMistakes * MISTAKE_PENALTY_MS;

      if (!user) {
        setGuestSummary({
          total_ms: effectiveTotalMs,
          mistake_count: handMistakes,
        });
        return;
      }

      setSubmitting(true);
      setSubmitError(null);
      const payload: SubmittedHand[] = final.map((h) => ({
        cards: h.cards,
        cut: h.cut,
        attempts: h.attempts,
        time_ms: h.time_ms,
      }));
      try {
        const saved = await submitGame(rounds, payload, {
          daily_date: mode === "daily" ? today : null,
          completed,
        });
        setFinalGame(saved);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "could not save game");
      } finally {
        setSubmitting(false);
      }
    },
    [rounds, user, mode, today],
  );

  const submit = useCallback(() => {
    if (!hands) return;
    const current = hands[index];
    if (!current) return;
    if (value === "") return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      // Treat invalid input as a wrong attempt.
    }
    const correct = scoreHand(current.cards, current.cut).total;
    if (parsed !== correct) {
      setMistakeCount((m) => m + 1);
      setFeedback("wrong");
      setAttempts((a) => a + 1);
      setValue("");
      inputRef.current?.focus();
      return;
    }
    const elapsed = Date.now() - handStartRef.current;
    const result: HandResult = {
      cards: current.cards,
      cut: current.cut,
      attempts,
      time_ms: elapsed,
      correct,
    };
    const next = [...results, result];
    setResults(next);
    if (index + 1 >= hands.length) {
      void finishGame(next, true);
    } else {
      setIndex(index + 1);
    }
  }, [hands, index, value, attempts, results, finishGame]);

  if (!rounds) {
    return <Navigate to="/cribbage" replace />;
  }
  if (!hands) {
    return <p>Dealing…</p>;
  }

  if (finalGame) {
    const totalMistakes = finalGame.mistakes;
    return (
      <div>
        <h1>Game complete</h1>
        <p>
          {rounds} hands · total {(finalGame.total_ms / 1000).toFixed(2)}s ·{" "}
          {totalMistakes} mistake{totalMistakes === 1 ? "" : "s"} (+
          {totalMistakes * 3}s).
        </p>
        {finalGame.isPersonalBest && (
          <p role="status" className={styles.pb}>
            🏆 New personal best for {rounds} hands!
          </p>
        )}
        <ul className={styles.actions}>
          <li>
            <button
              type="button"
              onClick={() => navigate(`/cribbage/play?rounds=${rounds}&mode=${mode}`)}
              disabled={mode === "daily"}
              title={mode === "daily" ? "Daily can only be played once per day" : undefined}
            >
              Play again
            </button>
          </li>
          <li>
            <Link to="/cribbage/records">View records</Link>
          </li>
          <li>
            <Link to="/cribbage">Back to start</Link>
          </li>
        </ul>
      </div>
    );
  }

  if (guestSummary) {
    const guestMistakes = guestSummary.mistake_count;
    return (
      <div>
        <h1>Game complete</h1>
        <p>
          {rounds} hands · total {(guestSummary.total_ms / 1000).toFixed(2)}s ·{" "}
          {guestMistakes} mistake{guestMistakes === 1 ? "" : "s"} (+
          {guestMistakes * 3}s).
        </p>
        <p role="status" className={styles.guestNote}>
          Your result was <strong>not saved</strong>. <Link to="/signin">Sign in</Link>{" "}
          or <Link to="/register">create an account</Link> to record next time.
        </p>
        <ul className={styles.actions}>
          <li>
            <button
              type="button"
              onClick={() => navigate(`/cribbage/play?rounds=${rounds}&mode=${mode}`)}
              disabled={mode === "daily"}
              title={mode === "daily" ? "Daily can only be played once per day" : undefined}
            >
              Play again
            </button>
          </li>
          <li>
            <Link to="/cribbage/records">View records</Link>
          </li>
          <li>
            <Link to="/cribbage">Back to start</Link>
          </li>
        </ul>
      </div>
    );
  }

  if (submitting) {
    return <p role="status" aria-live="polite">Saving game…</p>;
  }

  const current = hands[index]!;
  const handNumber = index + 1;
  const progress = `${handNumber} / ${hands.length}`;

  const liveTotalMs =
    Date.now() - gameStartRef.current + mistakeCount * MISTAKE_PENALTY_MS;
  const liveClock = (
    // aria-hidden because a 10 Hz updating digit is hostile to screen readers
    // — the heading already announces hand transitions; final time is
    // announced on the completion screen.
    <span className={styles.hearts} aria-hidden="true">
      {(liveTotalMs / 1000).toFixed(2)}s
    </span>
  );

  return (
    <div className={styles.game}>
      <header className={styles.header}>
        <h1>
          {mode === "daily" ? "Today's daily — " : ""}Hand {progress}
        </h1>
        {liveClock}
      </header>

      {submitError && <p role="alert">{submitError}</p>}

      <div className={styles.board}>
        <div className={styles.cutWrap}>
          <PlayingCard card={current.cut} isCut />
        </div>
        <div className={styles.handWrap}>
          <div className={styles.hand} aria-label="Hand cards">
            {current.cards.map((c, i) => (
              <PlayingCard key={`${index}-${i}-${c}`} card={c} />
            ))}
          </div>

          <form
            className={styles.entry}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor="answer">Points for this hand:</label>
            <input
              ref={inputRef}
              id="answer"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min={0}
              max={29}
              autoFocus
              autoComplete="off"
              value={value}
              readOnly={isMobile}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={feedback === "wrong"}
              aria-describedby={feedback === "wrong" ? "answer-error" : undefined}
              className={feedback === "wrong" ? styles.wrong : ""}
            />
            <button type="submit">Submit</button>
            {feedback === "wrong" && (
              <p id="answer-error" role="alert" className={styles.errorMsg}>
                Not quite — try again.
              </p>
            )}
          </form>

          {showOsk && (
            <OnScreenKeyboard value={value} onChange={setValue} onSubmit={submit} maxLen={3} />
          )}
        </div>
      </div>
    </div>
  );
}

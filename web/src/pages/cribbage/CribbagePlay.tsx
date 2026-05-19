import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { usePrefs } from "../../lib/prefs";
import { dealHands, scoreHand, type DealtHand } from "../../lib/cribbage";
import { submitGame, type RoundCount, type SavedGame, type SubmittedHand } from "../../lib/cribbageApi";
import { PlayingCard } from "../../components/PlayingCard";
import { OnScreenKeyboard } from "../../components/OnScreenKeyboard";
import styles from "./CribbagePlay.module.css";

function parseRounds(raw: string | null): RoundCount | null {
  if (raw === "5") return 5;
  if (raw === "20") return 20;
  if (raw === "100") return 100;
  return null;
}

interface HandResult {
  cards: string[];
  cut: string;
  attempts: number;
  time_ms: number;
  correct: number;
}

export function CribbagePlay(): JSX.Element {
  const [params] = useSearchParams();
  const rounds = parseRounds(params.get("rounds"));

  useDocumentTitle("Cribbage round — JMS");
  const { user } = useAuth();
  const { onScreenKeyboard } = usePrefs();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // dealHands depends on rounds; bail out early on invalid query.
  const hands = useMemo<DealtHand[] | null>(() => (rounds ? dealHands(rounds) : null), [rounds]);

  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [attempts, setAttempts] = useState(1);
  const [feedback, setFeedback] = useState<"" | "wrong">("");
  const [results, setResults] = useState<HandResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finalGame, setFinalGame] = useState<SavedGame | null>(null);
  const [guestSummary, setGuestSummary] = useState<{ total_ms: number; mistakes: number } | null>(null);
  const handStartRef = useRef<number>(Date.now());

  // Refocus the input whenever the hand changes (and after the user submits).
  useEffect(() => {
    inputRef.current?.focus();
    handStartRef.current = Date.now();
    setValue("");
    setAttempts(1);
    setFeedback("");
  }, [index]);

  const finishGame = useCallback(
    async (final: HandResult[]) => {
      if (!rounds) return;
      const totalMs = final.reduce((acc, h) => acc + h.time_ms, 0);
      const mistakes = final.reduce((acc, h) => acc + Math.max(0, h.attempts - 1), 0);
      if (!user) {
        // Guest: no API submit, no leaderboard entry. Show local-only summary.
        setGuestSummary({ total_ms: totalMs, mistakes });
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
        const saved = await submitGame(rounds, payload);
        setFinalGame(saved);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "could not save game");
      } finally {
        setSubmitting(false);
      }
    },
    [rounds, user],
  );

  const submit = useCallback(() => {
    if (!hands) return;
    const current = hands[index];
    if (!current) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || value === "" || parsed < 0) {
      // Treat as a wrong attempt only if a real number was entered; ignore empty.
      if (value === "") return;
      setFeedback("wrong");
      setAttempts((a) => a + 1);
      setValue("");
      return;
    }
    const correct = scoreHand(current.cards, current.cut).total;
    if (parsed !== correct) {
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
      void finishGame(next);
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
    return (
      <div>
        <h1>Game complete</h1>
        <p>
          {rounds} hands · total {(finalGame.total_ms / 1000).toFixed(2)}s ·{" "}
          {finalGame.mistakes} mistake{finalGame.mistakes === 1 ? "" : "s"}.
        </p>
        {finalGame.isPersonalBest && (
          <p role="status" className={styles.pb}>
            🏆 New personal best for {rounds} hands!
          </p>
        )}
        <ul className={styles.actions}>
          <li>
            <button type="button" onClick={() => navigate(`/cribbage/play?rounds=${rounds}`)}>
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
    return (
      <div>
        <h1>Game complete</h1>
        <p>
          {rounds} hands · total {(guestSummary.total_ms / 1000).toFixed(2)}s ·{" "}
          {guestSummary.mistakes} mistake{guestSummary.mistakes === 1 ? "" : "s"}.
        </p>
        <p role="status" className={styles.guestNote}>
          Your result was <strong>not saved</strong>. <Link to="/signin">Sign in</Link>{" "}
          or <Link to="/register">create an account</Link> to record next time.
        </p>
        <ul className={styles.actions}>
          <li>
            <button type="button" onClick={() => navigate(`/cribbage/play?rounds=${rounds}`)}>
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

  return (
    <div className={styles.game}>
      <header className={styles.header}>
        <h1>Hand {progress}</h1>
        {attempts > 1 && (
          <p className={styles.attempts} aria-live="polite">
            Attempts on this hand: {attempts}
          </p>
        )}
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

          {onScreenKeyboard && (
            <OnScreenKeyboard value={value} onChange={setValue} onSubmit={submit} maxLen={3} />
          )}
        </div>
      </div>
    </div>
  );
}

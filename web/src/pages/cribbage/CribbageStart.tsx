import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { usePrefs } from "../../lib/prefs";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { RoundCount } from "../../lib/cribbageApi";
import styles from "./CribbageStart.module.css";

const ROUNDS: RoundCount[] = [5, 20, 100];

export function CribbageStart(): JSX.Element {
  useDocumentTitle("Cribbage Speed Test — JMS");
  const { user } = useAuth();
  const { onScreenKeyboard, setOnScreenKeyboard } = usePrefs();
  const [rounds, setRounds] = useState<RoundCount>(5);
  const navigate = useNavigate();

  function start(): void {
    navigate(`/cribbage/play?rounds=${rounds}`);
  }

  return (
    <div className={styles.page}>
      <h1>Cribbage Speed Test</h1>
      {!user && (
        <div role="status" className={styles.guestNotice}>
          <strong>You are not signed in.</strong> You can still play, but your
          time and mistakes <strong>will not be saved</strong> — they won't
          appear on the leaderboard or any profile.{" "}
          <Link to="/signin">Sign in</Link> or{" "}
          <Link to="/register">create an account</Link> to record your results.
        </div>
      )}
      <p>
        Each round deals four cards to your hand and one cut card. Enter the
        total cribbage points the hand is worth and press Enter. Wrong answers
        keep the same hand on screen and count as a mistake — you cannot move
        on until the answer is correct.
      </p>
      <p>
        You are <strong>not the dealer</strong> in this game, so a cut Jack
        ("his heels") does <strong>not</strong> score. Jacks in your hand still
        score one point ("nobs") when the cut shares their suit.
      </p>

      <section aria-labelledby="rounds-heading">
        <h2 id="rounds-heading">Choose a length</h2>
        <div role="radiogroup" aria-label="Number of hands" className={styles.rounds}>
          {ROUNDS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rounds === n}
              onClick={() => setRounds(n)}
              className={rounds === n ? styles.active : ""}
            >
              {n} hands
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="osk-heading" className={styles.oskSection}>
        <h2 id="osk-heading">On-screen keyboard</h2>
        <label className={styles.toggle}>
          <span>Off</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Show on-screen number keyboard"
            aria-checked={onScreenKeyboard}
            checked={onScreenKeyboard}
            onChange={(e) => setOnScreenKeyboard(e.target.checked)}
          />
          <span>On</span>
        </label>
        <p className={styles.hint}>
          When on, a number pad appears under the input. Default is off. The
          same setting lives on the <Link to="/settings">Settings</Link> page.
        </p>
      </section>

      <button type="button" onClick={start} className={styles.start}>
        Start {rounds}-hand game
      </button>

      <nav aria-label="Cribbage navigation" className={styles.nav}>
        <Link to="/cribbage/help">How scoring works</Link>
        <Link to="/cribbage/records">Records leaderboard</Link>
        {user && <Link to={`/profile/${encodeURIComponent(user.username)}`}>Your profile</Link>}
      </nav>
    </div>
  );
}

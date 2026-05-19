import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { usePrefs } from "../../lib/prefs";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { fetchDaily, type RoundCount } from "../../lib/cribbageApi";
import { DailyCountdown } from "../../components/DailyCountdown";
import styles from "./CribbageStart.module.css";

const ROUNDS: RoundCount[] = [5, 20, 100];

export function CribbageStart(): JSX.Element {
  useDocumentTitle("Cribbage Speed Test — JMS");
  const { user } = useAuth();
  const { onScreenKeyboard, setOnScreenKeyboard } = usePrefs();
  const [rounds, setRounds] = useState<RoundCount>(5);
  const navigate = useNavigate();

  const [playedToday, setPlayedToday] = useState<Record<RoundCount, boolean | null>>({
    5: null,
    20: null,
    100: null,
  });

  const refreshDailyStatus = useCallback(async () => {
    try {
      const results = await Promise.all(ROUNDS.map((n) => fetchDaily(n)));
      const next: Record<RoundCount, boolean> = { 5: false, 20: false, 100: false };
      for (const r of results) next[r.round_count] = r.played;
      setPlayedToday(next);
    } catch {
      setPlayedToday({ 5: false, 20: false, 100: false });
    }
  }, []);

  useEffect(() => {
    void refreshDailyStatus();
  }, [refreshDailyStatus]);

  function startFreePlay(): void {
    navigate(`/cribbage/play?rounds=${rounds}&mode=freeplay`);
  }

  function startDaily(n: RoundCount): void {
    navigate(`/cribbage/play?rounds=${n}&mode=daily`);
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
        keep the same hand on screen and <strong>cost a life</strong> — you have{" "}
        <strong>three lives</strong> per run; lose them all and the game ends
        immediately.
      </p>
      <p>
        Cards are dealt from a single freshly-shuffled 52-card deck. Hands are
        always five unique cards (4 hand + cut), but in longer games the deck
        runs out — when it does, we reshuffle a fresh full deck and keep
        dealing. So in a 20- or 100-hand run the same card can appear in
        different hands, just never within the same hand.
      </p>
      <p>
        You are <strong>not the dealer</strong> in this game, so a cut Jack
        ("his heels") does <strong>not</strong> score. Jacks in your hand still
        score one point ("nobs") when the cut shares their suit.
      </p>

      <section aria-labelledby="daily-heading" className={styles.dailySection}>
        <header className={styles.dailyHeader}>
          <h2 id="daily-heading">Today's daily challenge</h2>
          <DailyCountdown onRollover={refreshDailyStatus} />
        </header>
        <p className={styles.dailyHint}>
          Everyone plays the same hands today. First attempt of the day at each
          length locks in your result.
        </p>
        <div className={styles.dailyButtons}>
          {ROUNDS.map((n) => {
            const played = playedToday[n];
            return (
              <button
                key={n}
                type="button"
                onClick={() => startDaily(n)}
                disabled={played === true}
                aria-describedby={`daily-${n}-status`}
              >
                Play daily {n}
                <span id={`daily-${n}-status`} className={styles.dailyStatus}>
                  {played === null ? "" : played ? "already played" : "available"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="freeplay-heading" className={styles.freeplaySection}>
        <h2 id="freeplay-heading">Free play</h2>
        <p className={styles.dailyHint}>
          Unlimited practice. Free-play games save to your profile history but
          don't appear on the public leaderboard.
        </p>
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
        <button type="button" onClick={startFreePlay} className={styles.start}>
          Start {rounds}-hand free-play game
        </button>
      </section>

      <section aria-labelledby="osk-heading" className={styles.oskSection}>
        <h2 id="osk-heading">On-screen keyboard</h2>
        <label className={styles.toggle}>
          <span>Off</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Show on-screen number keyboard (desktop only — mobile always uses it)"
            aria-checked={onScreenKeyboard}
            checked={onScreenKeyboard}
            onChange={(e) => setOnScreenKeyboard(e.target.checked)}
          />
          <span>On</span>
        </label>
        <p className={styles.hint}>
          When on, a number pad appears under the input on desktop. On mobile
          the on-screen pad is always shown (the native keyboard is locked out)
          so this toggle only affects desktop. The same setting lives on the{" "}
          <Link to="/settings">Settings</Link> page.
        </p>
      </section>

      <nav aria-label="Cribbage navigation" className={styles.nav}>
        <Link to="/cribbage/help">How scoring works</Link>
        <Link to="/cribbage/records">Records leaderboard</Link>
        {user && <Link to={`/profile/${encodeURIComponent(user.username)}`}>Your profile</Link>}
      </nav>
    </div>
  );
}

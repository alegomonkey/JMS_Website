import { useEffect, useState } from "react";
import styles from "./DailyCountdown.module.css";

function msUntilNextUtcMidnight(now = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(0, next - now);
}

function format(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

interface Props {
  // Called once when the timer crosses zero, so the parent can re-fetch
  // daily-leaderboard / daily hands for the new day.
  onRollover?: () => void;
}

export function DailyCountdown({ onRollover }: Props): JSX.Element {
  const [remaining, setRemaining] = useState(() => msUntilNextUtcMidnight());

  useEffect(() => {
    const id = window.setInterval(() => {
      const r = msUntilNextUtcMidnight();
      setRemaining((prev) => {
        if (prev > 0 && r > prev) {
          // Counter just wrapped — we crossed midnight UTC.
          onRollover?.();
        }
        return r;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [onRollover]);

  return (
    <span className={styles.countdown} aria-label={`Next daily in ${format(remaining)}`}>
      <span className={styles.label}>Next daily in</span>{" "}
      <time className={styles.value}>{format(remaining)}</time>
    </span>
  );
}

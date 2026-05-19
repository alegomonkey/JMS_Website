import { useEffect, useState } from "react";
import styles from "./DailyCountdown.module.css";

const DAILY_ZONE = "America/New_York";

// Wall-clock parts (year/month/day/hour/minute/second) at `instant` in `zone`,
// taken as if those parts were UTC. The diff `localUtcMs - instant` is the
// zone's UTC offset at that instant (DST-aware).
function zoneWallClockUtcMs(instant: number): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: DAILY_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(instant));
  const get = (t: string): number =>
    Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}

function msUntilNextEtMidnight(now = Date.now()): number {
  // Today's date in ET, derived once via formatter.
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  const [y, m, d] = todayParts.split("-").map(Number);
  // Tomorrow at 00:00 in ET, expressed as if it were UTC. Subtract the zone's
  // offset to convert back to the real UTC instant.
  const wantedAsUtc = Date.UTC(y!, m! - 1, d! + 1, 0, 0, 0);
  // Use a probe near the target to pick the correct offset across DST changes.
  const offset = zoneWallClockUtcMs(wantedAsUtc) - wantedAsUtc;
  const targetUtc = wantedAsUtc - offset;
  return Math.max(0, targetUtc - now);
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
  const [remaining, setRemaining] = useState(() => msUntilNextEtMidnight());

  useEffect(() => {
    const id = window.setInterval(() => {
      const r = msUntilNextEtMidnight();
      setRemaining((prev) => {
        if (prev > 0 && r > prev) {
          // Counter just wrapped — we crossed midnight ET.
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

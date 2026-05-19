-- Daily challenge support + completion gating for the cribbage game.
--
-- daily_date is NULL for free-play, "YYYY-MM-DD" (UTC) for daily runs.
-- completed = 0 means the player ran out of lives; those runs save for audit
-- but never count toward leaderboards or personal bests.
-- The `mistakes` column on cribbage_games stays in place; from this migration
-- onward it stores lives_lost (0-3). Old rows may exceed 3.

ALTER TABLE cribbage_games ADD COLUMN daily_date TEXT;
ALTER TABLE cribbage_games ADD COLUMN completed INTEGER NOT NULL DEFAULT 1;

-- A single completed-or-not attempt per (user, length, day) for daily mode.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cribbage_daily_one_per_user
  ON cribbage_games(user_id, round_count, daily_date)
  WHERE daily_date IS NOT NULL;

-- Daily leaderboard query support.
CREATE INDEX IF NOT EXISTS idx_cribbage_daily_lb
  ON cribbage_games(daily_date, round_count, total_ms)
  WHERE daily_date IS NOT NULL AND completed = 1;

-- Label whether the recorded "best overall" came from a daily run.
ALTER TABLE cribbage_best_times ADD COLUMN is_daily INTEGER NOT NULL DEFAULT 0;

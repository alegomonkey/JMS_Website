ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS cribbage_games (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_count  INTEGER NOT NULL CHECK (round_count IN (5, 20, 100)),
  total_ms     INTEGER NOT NULL CHECK (total_ms >= 0),
  mistakes     INTEGER NOT NULL CHECK (mistakes >= 0),
  hands_json   TEXT NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_cribbage_games_user ON cribbage_games(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cribbage_games_lb   ON cribbage_games(round_count, total_ms);

CREATE TABLE IF NOT EXISTS cribbage_best_times (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_count  INTEGER NOT NULL CHECK (round_count IN (5, 20, 100)),
  game_id      INTEGER NOT NULL REFERENCES cribbage_games(id) ON DELETE CASCADE,
  total_ms     INTEGER NOT NULL,
  mistakes     INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, round_count)
);
CREATE INDEX IF NOT EXISTS idx_cribbage_best_lb ON cribbage_best_times(round_count, total_ms);

CREATE TABLE IF NOT EXISTS profile_comments (
  id              INTEGER PRIMARY KEY,
  profile_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_profile_comments_user
  ON profile_comments(profile_user_id, created_at DESC);

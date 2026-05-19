-- OAuth support: allow OAuth-only accounts (NULL password_hash) and add the
-- users_oauth join table.
--
-- SQLite has no ALTER COLUMN, so making password_hash nullable requires the
-- documented table-rebuild dance. runMigrations() wraps each migration in a
-- transaction, so we use PRAGMA defer_foreign_keys=ON (works inside a
-- transaction) rather than PRAGMA foreign_keys=OFF (only works outside one).
-- Deferred FK checks run at COMMIT, so DROP+RENAME below is safe even though
-- other tables (comments, votes, cribbage_games, ...) reference users(id).

PRAGMA defer_foreign_keys = ON;

CREATE TABLE users_new (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  bio           TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO users_new (id, username, password_hash, role, bio, created_at)
SELECT id, username, password_hash, role, bio, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE TABLE IF NOT EXISTS users_oauth (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT    NOT NULL CHECK (provider IN ('github','google')),
  provider_user_id TEXT    NOT NULL,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, provider),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_users_oauth_lookup
  ON users_oauth (provider, provider_user_id);

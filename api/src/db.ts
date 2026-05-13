import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type DB = Database.Database;

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function runMigrations(db: DB): void {
  const dir = join(__dirname, "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const tracked = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
    )
    .get();

  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`);

  // Bootstrap: a pre-existing DB without tracking has already had every
  // current migration applied; record them so we don't try to re-run.
  if (!tracked) {
    const usersExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get();
    if (usersExists) {
      const seed = db.prepare(
        "INSERT OR IGNORE INTO schema_migrations (filename) VALUES (?)",
      );
      for (const file of files) seed.run(file);
    }
  }

  const applied = new Set(
    (
      db.prepare("SELECT filename FROM schema_migrations").all() as {
        filename: string;
      }[]
    ).map((r) => r.filename),
  );

  const record = db.prepare(
    "INSERT INTO schema_migrations (filename) VALUES (?)",
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      record.run(file);
    })();
  }
}

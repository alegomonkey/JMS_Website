import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";
import session from "express-session";
import { createApp } from "../src/app.js";
import { openDb, runMigrations } from "../src/db.js";
import { setRole } from "../src/services/userService.js";

export interface TestEnv {
  app: Express;
  cleanup: () => void;
  promote: (username: string) => void;
}

export function makeTestApp(): TestEnv {
  const dir = mkdtempSync(join(tmpdir(), "jms-test-"));
  const dbPath = join(dir, "test.db");
  const db = openDb(dbPath);
  runMigrations(db);
  // Use an in-memory session store for tests: connect-sqlite3 holds a
  // setInterval sweep that would outlive afterEach cleanup.
  const sessionStore = new session.MemoryStore();
  const app = createApp(db, {
    sessionSecret: "test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    isProd: false,
    sessionStore,
  });
  return {
    app,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
    promote: (username) => {
      setRole(db, username, "admin");
    },
  };
}

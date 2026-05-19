import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";
import session from "express-session";
import { createApp } from "../src/app.js";
import { openDb, runMigrations, type DB } from "../src/db.js";
import { setRole } from "../src/services/userService.js";
import type { ProviderCredentials } from "../src/services/oauthProviders.js";
import type { OauthProvider } from "../src/middleware/auth.js";

export interface TestEnv {
  app: Express;
  db: DB;
  cleanup: () => void;
  promote: (username: string) => void;
}

export interface TestAppOpts {
  oauthProviders?: Partial<Record<OauthProvider, ProviderCredentials>>;
}

export function makeTestApp(opts: TestAppOpts = {}): TestEnv {
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
    oauth: {
      baseUrl: "http://localhost:5173",
      providers: opts.oauthProviders ?? {},
    },
  });
  return {
    app,
    db,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
    promote: (username) => {
      setRole(db, username, "admin");
    },
  };
}

import { dirname, basename } from "node:path";
import session from "express-session";
import ConnectSqlite3 from "connect-sqlite3";
import { openDb, runMigrations } from "./db.js";
import { createApp } from "./app.js";

const DB_PATH = process.env.DB_PATH ?? "/data/jms.db";
const PORT = Number(process.env.API_PORT ?? 3000);
const SECRET = process.env.SESSION_SECRET;
const IS_PROD = process.env.NODE_ENV === "production";

if (!SECRET || SECRET.length < 32) {
  console.error("SESSION_SECRET must be set and at least 32 chars long");
  process.exit(1);
}

const db = openDb(DB_PATH);
runMigrations(db);

const SQLiteStore = ConnectSqlite3(session);
const sessionStore = new SQLiteStore({
  db: "sessions.sqlite",
  dir: dirname(DB_PATH),
  table: basename("sessions"),
});

const app = createApp(db, {
  sessionSecret: SECRET,
  isProd: IS_PROD,
  sessionStore,
});

app.listen(PORT, () => {
  console.log(`api listening on ${PORT}`);
});

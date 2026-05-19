import { dirname, basename } from "node:path";
import session from "express-session";
import ConnectSqlite3 from "connect-sqlite3";
import { openDb, runMigrations } from "./db.js";
import { createApp } from "./app.js";
import type { ProviderCredentials } from "./services/oauthProviders.js";
import type { OauthProvider } from "./middleware/auth.js";

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

const DOMAIN = process.env.DOMAIN ?? "localhost";
const OAUTH_BASE_URL =
  process.env.PUBLIC_BASE_URL ?? (IS_PROD ? `https://${DOMAIN}` : `http://${DOMAIN}`);

const GH_ID = process.env.GITHUB_CLIENT_ID;
const GH_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GG_ID = process.env.GOOGLE_CLIENT_ID;
const GG_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const oauthProviders: Partial<Record<OauthProvider, ProviderCredentials>> = {};
if (GH_ID && GH_SECRET) {
  oauthProviders.github = { clientId: GH_ID, clientSecret: GH_SECRET };
} else if (GH_ID || GH_SECRET) {
  console.warn("GitHub OAuth: only one of GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET is set; provider disabled.");
}
if (GG_ID && GG_SECRET) {
  oauthProviders.google = { clientId: GG_ID, clientSecret: GG_SECRET };
} else if (GG_ID || GG_SECRET) {
  console.warn("Google OAuth: only one of GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET is set; provider disabled.");
}

const app = createApp(db, {
  sessionSecret: SECRET,
  isProd: IS_PROD,
  sessionStore,
  oauth: { baseUrl: OAUTH_BASE_URL, providers: oauthProviders },
});

app.listen(PORT, () => {
  console.log(`api listening on ${PORT}`);
});

import express, { type Express } from "express";
import session from "express-session";
import helmet from "helmet";
import type { DB } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { commentsRouter } from "./routes/comments.js";
import { votesRouter } from "./routes/votes.js";
import { cribbageRouter } from "./routes/cribbage.js";
import { usersRouter } from "./routes/users.js";
import { profileCommentsRouter } from "./routes/profileComments.js";
import { oauthRouter, enabledProviders } from "./routes/oauth.js";
import { teamFormationsRouter } from "./routes/teamFormations.js";
import { surveysRouter } from "./routes/surveys.js";
import { verifyCsrf } from "./middleware/csrf.js";
import { errorHandler } from "./middleware/errorHandler.js";
import type { ProviderCredentials } from "./services/oauthProviders.js";
import type { OauthProvider } from "./middleware/auth.js";

export interface AppConfig {
  sessionSecret: string;
  isProd: boolean;
  sessionStore: session.Store;
  oauth: {
    baseUrl: string;
    providers: Partial<Record<OauthProvider, ProviderCredentials>>;
  };
}

export function createApp(db: DB, cfg: AppConfig): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  // The API only ever returns JSON; the page-rendering CSP lives in nginx for
  // the static bundle. Locking everything down here is defense-in-depth: a
  // browser asked to render an /api/* response cannot fetch sub-resources.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-origin" },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use(express.json({ limit: "32kb" }));

  app.use(
    session({
      store: cfg.sessionStore,
      name: "jms.sid",
      secret: cfg.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      // express-session signs the cookie value with `secret`, so any byte-level
      // tampering invalidates the session. The flags below reduce the blast
      // radius of cookie theft (httpOnly: no JS access; sameSite: no
      // cross-site CSRF carrying; secure: only over TLS in prod).
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: cfg.isProd,
        path: "/",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  const providersEnabled = enabledProviders(cfg.oauth);
  app.use("/api/auth", authRouter(db, { providersEnabled }));
  app.use("/api/auth", oauthRouter(db, cfg.oauth));
  app.use("/api", verifyCsrf, commentsRouter(db));
  app.use("/api", verifyCsrf, votesRouter(db));
  app.use("/api", verifyCsrf, cribbageRouter(db));
  app.use("/api", verifyCsrf, usersRouter(db));
  app.use("/api", verifyCsrf, profileCommentsRouter(db));
  app.use("/api", verifyCsrf, teamFormationsRouter(db));
  app.use("/api", verifyCsrf, surveysRouter(db));

  app.use(errorHandler);
  return app;
}

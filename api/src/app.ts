import express, { type Express } from "express";
import session from "express-session";
import helmet from "helmet";
import type { DB } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { commentsRouter } from "./routes/comments.js";
import { votesRouter } from "./routes/votes.js";
import { verifyCsrf } from "./middleware/csrf.js";
import { errorHandler } from "./middleware/errorHandler.js";

export interface AppConfig {
  sessionSecret: string;
  isProd: boolean;
  sessionStore: session.Store;
}

export function createApp(db: DB, cfg: AppConfig): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "32kb" }));

  app.use(
    session({
      store: cfg.sessionStore,
      name: "jms.sid",
      secret: cfg.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: cfg.isProd,
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter(db));
  app.use("/api", verifyCsrf, commentsRouter(db));
  app.use("/api", verifyCsrf, votesRouter(db));

  app.use(errorHandler);
  return app;
}

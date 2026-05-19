import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import type { DB } from "../db.js";
import { ensureCsrfToken, verifyCsrf } from "../middleware/csrf.js";
import { httpError } from "../middleware/errorHandler.js";
import { oauthCompleteSchema } from "../schemas/index.js";
import {
  PROVIDERS,
  exchangeCodeForUser,
  type ProviderCredentials,
} from "../services/oauthProviders.js";
import {
  findUserByOauth,
  createOauthUser,
  linkOauth,
  unlinkOauth,
  OauthAlreadyLinkedError,
  OauthUnlinkLockoutError,
  OauthNotLinkedError,
} from "../services/oauthService.js";
import { UsernameTakenError, findUser } from "../services/userService.js";
import type { OauthProvider } from "../middleware/auth.js";

export interface OauthRouterConfig {
  baseUrl: string;
  providers: Partial<Record<OauthProvider, ProviderCredentials>>;
}

function parseProvider(raw: string): OauthProvider | null {
  return raw === "github" || raw === "google" ? raw : null;
}

function redirectUri(baseUrl: string, provider: OauthProvider): string {
  return `${baseUrl}/api/auth/${provider}/callback`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function clearOauthFlow(req: Request): void {
  delete req.session.oauthState;
  delete req.session.oauthIntent;
}

function authorizeUrlFor(
  provider: OauthProvider,
  clientId: string,
  redirectUriStr: string,
  state: string,
): string {
  const cfg = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUriStr,
    scope: cfg.scope,
    state,
    response_type: "code",
  });
  if (provider === "google") {
    params.set("access_type", "online");
    params.set("prompt", "select_account");
  }
  if (provider === "github") {
    params.set("allow_signup", "true");
  }
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

export function oauthRouter(db: DB, cfg: OauthRouterConfig): Router {
  const r = Router();

  // Per-app limiter (not a module singleton) so each test app and each
  // restart gets a clean counter. 30 writes / 15 min is generous for legit
  // use (typo + retry on /oauth/complete; rare unlink) while still slowing
  // brute-force abuse.
  const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "too many attempts, try again later" },
  });

  function isConfigured(provider: OauthProvider): boolean {
    const c = cfg.providers[provider];
    return Boolean(c && c.clientId && c.clientSecret);
  }

  r.get("/pending", (req, res) => {
    const p = req.session.pendingOauth;
    if (!p) {
      res.json({ pending: null });
      return;
    }
    res.json({
      pending: {
        provider: p.provider,
        suggestedUsername: p.suggestedUsername,
      },
    });
  });

  r.post("/oauth/complete", writeLimiter, (req, res, next) => {
    try {
      const pending = req.session.pendingOauth;
      if (!pending) {
        return next(httpError(400, "no pending oauth signup"));
      }
      const { username } = oauthCompleteSchema.parse(req.body);
      try {
        const user = createOauthUser(
          db,
          username,
          pending.provider,
          pending.providerUserId,
        );
        req.session.regenerate((err) => {
          if (err) return next(err);
          req.session.userId = user.id;
          req.session.username = user.username;
          ensureCsrfToken(req);
          req.session.save((saveErr) => {
            if (saveErr) return next(saveErr);
            res.status(201).json({ user });
          });
        });
      } catch (err) {
        if (err instanceof UsernameTakenError) {
          return next(httpError(409, "username taken"));
        }
        if (err instanceof OauthAlreadyLinkedError) {
          return next(httpError(409, "that provider account is already linked"));
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  r.post("/:provider/unlink", verifyCsrf, writeLimiter, (req, res, next) => {
    const userId = req.session.userId;
    if (!userId) return next(httpError(401, "authentication required"));
    const provider = parseProvider(req.params.provider!);
    if (!provider) return next(httpError(404, "unknown provider"));
    try {
      unlinkOauth(db, userId, provider);
      res.status(204).end();
    } catch (err) {
      if (err instanceof OauthUnlinkLockoutError) {
        return next(httpError(409, err.message));
      }
      if (err instanceof OauthNotLinkedError) {
        return next(httpError(404, err.message));
      }
      next(err);
    }
  });

  r.get(
    "/:provider/start",
    (req: Request, res: Response, next: NextFunction) => {
      const provider = parseProvider(req.params.provider!);
      if (!provider) return next(httpError(404, "unknown provider"));
      if (!isConfigured(provider)) {
        return next(httpError(404, "provider not configured"));
      }
      const state = randomBytes(32).toString("hex");
      req.session.oauthState = state;
      req.session.oauthIntent = "signin";
      delete req.session.pendingOauth;
      req.session.save((err) => {
        if (err) return next(err);
        const url = authorizeUrlFor(
          provider,
          cfg.providers[provider]!.clientId,
          redirectUri(cfg.baseUrl, provider),
          state,
        );
        res.redirect(url);
      });
    },
  );

  r.get(
    "/:provider/link/start",
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.session.userId) {
        return res.redirect("/signin?err=login_required");
      }
      const provider = parseProvider(req.params.provider!);
      if (!provider) return next(httpError(404, "unknown provider"));
      if (!isConfigured(provider)) {
        return next(httpError(404, "provider not configured"));
      }
      const state = randomBytes(32).toString("hex");
      req.session.oauthState = state;
      req.session.oauthIntent = "link";
      delete req.session.pendingOauth;
      req.session.save((err) => {
        if (err) return next(err);
        const url = authorizeUrlFor(
          provider,
          cfg.providers[provider]!.clientId,
          redirectUri(cfg.baseUrl, provider),
          state,
        );
        res.redirect(url);
      });
    },
  );

  r.get(
    "/:provider/callback",
    async (req: Request, res: Response, next: NextFunction) => {
      const provider = parseProvider(req.params.provider!);
      const intent = req.session.oauthIntent;
      const expectedState = req.session.oauthState;
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const failTo = intent === "link" ? "/settings" : "/signin";

      if (!provider) return next(httpError(404, "unknown provider"));

      if (!expectedState || !state || !safeEqual(state, expectedState)) {
        clearOauthFlow(req);
        return res.redirect(`${failTo}?err=oauth_state`);
      }
      if (!code) {
        clearOauthFlow(req);
        return res.redirect(`${failTo}?err=oauth_code`);
      }
      if (!isConfigured(provider)) {
        clearOauthFlow(req);
        return res.redirect(`${failTo}?err=oauth_unconfigured`);
      }

      let providerUser;
      try {
        providerUser = await exchangeCodeForUser(
          provider,
          cfg.providers[provider]!,
          code,
          redirectUri(cfg.baseUrl, provider),
        );
      } catch {
        clearOauthFlow(req);
        return res.redirect(`${failTo}?err=oauth_exchange`);
      }

      clearOauthFlow(req);

      if (intent === "link") {
        const userId = req.session.userId;
        if (!userId) {
          return res.redirect("/signin?err=login_required");
        }
        try {
          linkOauth(db, userId, provider, providerUser.providerUserId);
        } catch (err) {
          if (err instanceof OauthAlreadyLinkedError) {
            return res.redirect("/settings?err=oauth_already_linked");
          }
          return next(err);
        }
        return res.redirect("/settings?ok=oauth_linked");
      }

      // signin/signup
      const existing = findUserByOauth(db, provider, providerUser.providerUserId);
      if (existing) {
        req.session.regenerate((err) => {
          if (err) return next(err);
          req.session.userId = existing.id;
          req.session.username = existing.username;
          ensureCsrfToken(req);
          req.session.save((saveErr) => {
            if (saveErr) return next(saveErr);
            res.redirect("/");
          });
        });
        return;
      }

      // No existing user_oauth row. If someone is already signed in, refuse
      // — they should use the Settings → Link flow instead of accidentally
      // forking a second account.
      if (req.session.userId) {
        return res.redirect("/settings?err=oauth_use_link");
      }

      req.session.pendingOauth = {
        provider,
        providerUserId: providerUser.providerUserId,
        suggestedUsername: providerUser.suggestedUsername,
      };
      req.session.save((err) => {
        if (err) return next(err);
        res.redirect("/auth/complete");
      });
    },
  );

  return r;
}

export function enabledProviders(
  cfg: OauthRouterConfig,
): Record<OauthProvider, boolean> {
  return {
    github: Boolean(cfg.providers.github?.clientId && cfg.providers.github?.clientSecret),
    google: Boolean(cfg.providers.google?.clientId && cfg.providers.google?.clientSecret),
  };
}

// Re-export for the /me handler so it can list current user's links.
export { findUser };

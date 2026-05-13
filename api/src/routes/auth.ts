import { Router } from "express";
import type { DB } from "../db.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { ensureCsrfToken } from "../middleware/csrf.js";
import { credentialsSchema } from "../schemas/index.js";
import { createUser, findUser, UsernameTakenError, verifyCredentials } from "../services/userService.js";
import { httpError } from "../middleware/errorHandler.js";

export function authRouter(db: DB): Router {
  const r = Router();

  r.get("/me", (req, res) => {
    const id = req.session.userId;
    if (!id) {
      res.json({ user: null });
      return;
    }
    const user = findUser(db, id);
    res.json({ user });
  });

  r.get("/csrf", (req, res) => {
    const token = ensureCsrfToken(req);
    res.json({ token });
  });

  r.post("/register", authLimiter, async (req, res, next) => {
    try {
      const { username, password } = credentialsSchema.parse(req.body);
      const user = await createUser(db, username, password);
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
        next(httpError(409, "username taken"));
        return;
      }
      next(err);
    }
  });

  r.post("/login", authLimiter, async (req, res, next) => {
    try {
      const { username, password } = credentialsSchema.parse(req.body);
      const user = await verifyCredentials(db, username, password);
      if (!user) {
        next(httpError(401, "invalid credentials"));
        return;
      }
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = user.id;
        req.session.username = user.username;
        ensureCsrfToken(req);
        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          res.json({ user });
        });
      });
    } catch (err) {
      next(err);
    }
  });

  r.post("/logout", (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("jms.sid");
      res.status(204).end();
    });
  });

  return r;
}

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const HEADER = "x-csrf-token";

export function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

export function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  // Unauthenticated writes have no session to abuse; let requireAuth answer
  // with 401. CSRF only matters once a real session exists.
  if (!req.session.userId) {
    next();
    return;
  }
  const sent = req.header(HEADER);
  const expected = req.session.csrfToken;
  if (!sent || !expected || !sameLengthEqual(sent, expected)) {
    res.status(403).json({ error: "invalid csrf token" });
    return;
  }
  next();
}

function sameLengthEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

import rateLimit from "express-rate-limit";

// Rate limiters are module singletons, so within a single test process their
// counters would accumulate across unrelated tests and produce spurious 429s.
// Disable them under the test runner (vitest sets NODE_ENV=test). Production
// and dev are unaffected.
const skipInTest = (): boolean => process.env.NODE_ENV === "test";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "too many attempts, try again later" },
  skip: skipInTest,
});

export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "rate limit exceeded" },
  skip: skipInTest,
});

export const validateCodeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "too many validation attempts, try again later" },
  skip: skipInTest,
});

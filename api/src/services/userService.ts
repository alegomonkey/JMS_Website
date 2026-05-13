import argon2 from "argon2";
import type { DB } from "../db.js";

export type Role = "user" | "admin";

export interface User {
  id: number;
  username: string;
  role: Role;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
}

const ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class UsernameTakenError extends Error {
  constructor() {
    super("username taken");
  }
}

export async function createUser(db: DB, username: string, password: string): Promise<User> {
  const hash = await argon2.hash(password, ARGON_OPTS);
  try {
    const info = db
      .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
      .run(username, hash);
    return { id: Number(info.lastInsertRowid), username, role: "user" };
  } catch (err) {
    if (err instanceof Error && /UNIQUE/.test(err.message)) {
      throw new UsernameTakenError();
    }
    throw err;
  }
}

export async function verifyCredentials(
  db: DB,
  username: string,
  password: string,
): Promise<User | null> {
  const row = db
    .prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?")
    .get(username) as UserRow | undefined;
  if (!row) {
    // Constant-time-ish: still hash to avoid leaking existence via timing.
    await argon2.hash(password, ARGON_OPTS).catch(() => undefined);
    return null;
  }
  const ok = await argon2.verify(row.password_hash, password);
  return ok ? { id: row.id, username: row.username, role: row.role } : null;
}

export function findUser(db: DB, id: number): User | null {
  const row = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(id) as
    | User
    | undefined;
  return row ?? null;
}

export class UserNotFoundError extends Error {
  constructor(username: string) {
    super(`no such user: ${username}`);
  }
}

export function setRole(db: DB, username: string, role: Role): User {
  const info = db
    .prepare("UPDATE users SET role = ? WHERE username = ?")
    .run(role, username);
  if (info.changes === 0) {
    throw new UserNotFoundError(username);
  }
  const row = db
    .prepare("SELECT id, username, role FROM users WHERE username = ?")
    .get(username) as User;
  return row;
}

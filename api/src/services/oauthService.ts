import type { DB } from "../db.js";
import type { OauthProvider } from "../middleware/auth.js";
import { UsernameTakenError, type User } from "./userService.js";

export class OauthAlreadyLinkedError extends Error {
  constructor() {
    super("oauth identity already linked to a different account");
  }
}

export class OauthUnlinkLockoutError extends Error {
  constructor() {
    super("cannot unlink: this is the only sign-in method for this account");
  }
}

export class OauthNotLinkedError extends Error {
  constructor() {
    super("provider is not linked to this account");
  }
}

export interface OauthLink {
  provider: OauthProvider;
  created_at: number;
}

export function findUserByOauth(
  db: DB,
  provider: OauthProvider,
  providerUserId: string,
): User | null {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.role
       FROM users_oauth o
       JOIN users u ON u.id = o.user_id
       WHERE o.provider = ? AND o.provider_user_id = ?`,
    )
    .get(provider, providerUserId) as User | undefined;
  return row ?? null;
}

export function listOauthLinks(db: DB, userId: number): OauthLink[] {
  return db
    .prepare(
      "SELECT provider, created_at FROM users_oauth WHERE user_id = ? ORDER BY created_at ASC",
    )
    .all(userId) as OauthLink[];
}

export function linkOauth(
  db: DB,
  userId: number,
  provider: OauthProvider,
  providerUserId: string,
): void {
  try {
    db.prepare(
      "INSERT INTO users_oauth (user_id, provider, provider_user_id) VALUES (?, ?, ?)",
    ).run(userId, provider, providerUserId);
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      throw new OauthAlreadyLinkedError();
    }
    throw err;
  }
}

export function unlinkOauth(db: DB, userId: number, provider: OauthProvider): void {
  const tx = db.transaction(() => {
    const userRow = db
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(userId) as { password_hash: string | null } | undefined;
    if (!userRow) throw new OauthNotLinkedError();

    const otherLinks = db
      .prepare(
        "SELECT COUNT(*) AS c FROM users_oauth WHERE user_id = ? AND provider <> ?",
      )
      .get(userId, provider) as { c: number };

    const hasPassword = userRow.password_hash !== null;
    if (!hasPassword && otherLinks.c === 0) {
      throw new OauthUnlinkLockoutError();
    }

    const info = db
      .prepare("DELETE FROM users_oauth WHERE user_id = ? AND provider = ?")
      .run(userId, provider);
    if (info.changes === 0) throw new OauthNotLinkedError();
  });
  tx();
}

export function createOauthUser(
  db: DB,
  username: string,
  provider: OauthProvider,
  providerUserId: string,
): User {
  const tx = db.transaction((): User => {
    let userId: number;
    try {
      const info = db
        .prepare("INSERT INTO users (username, password_hash) VALUES (?, NULL)")
        .run(username);
      userId = Number(info.lastInsertRowid);
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        throw new UsernameTakenError();
      }
      throw err;
    }
    try {
      db.prepare(
        "INSERT INTO users_oauth (user_id, provider, provider_user_id) VALUES (?, ?, ?)",
      ).run(userId, provider, providerUserId);
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        throw new OauthAlreadyLinkedError();
      }
      throw err;
    }
    return { id: userId, username, role: "user" };
  });
  return tx();
}

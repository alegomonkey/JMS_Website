// Usage:
//   docker compose exec api node dist/scripts/promote.js <username> [--demote]
//
// Promotes the given user to admin (or demotes back to user with --demote).
// Run by the server operator. The user must already exist — register through
// the UI first, then run this against their username.

import { openDb, runMigrations } from "../db.js";
import { setRole, UserNotFoundError, type Role } from "../services/userService.js";

function main(): void {
  const args = process.argv.slice(2);
  const username = args[0];
  const demote = args.includes("--demote");

  if (!username || username.startsWith("--")) {
    console.error("usage: promote <username> [--demote]");
    process.exit(2);
  }

  const dbPath = process.env.DB_PATH ?? "/data/jms.db";
  const db = openDb(dbPath);
  runMigrations(db);

  const role: Role = demote ? "user" : "admin";
  try {
    const user = setRole(db, username, role);
    console.log(`ok: ${user.username} is now ${user.role}`);
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  } finally {
    db.close();
  }
}

main();

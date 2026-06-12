import Database from "better-sqlite3";
import { resolve, dirname } from "path";
import { mkdirSync } from "fs";

const DB_PATH = process.env.DATABASE_PATH ?? "./data/relay.db";

mkdirSync(dirname(resolve(DB_PATH)), { recursive: true });
export const db: Database.Database = new Database(resolve(DB_PATH));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Base schema (v1 — idempotent)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    avatar TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS guilds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS shotcallers (
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, guild_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    stopped_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS session_targets (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL,
    added_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (session_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS session_sources (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    added_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (session_id, user_id)
  );
`);

// Migration v2: drop old single-source columns from sessions if they exist
const version = db.pragma("user_version", { simple: true }) as number;
if (version < 2) {
  const cols = (
    db.pragma("table_info(sessions)") as Array<{ name: string }>
  ).map((c) => c.name);

  if (cols.includes("shotcaller_user_id")) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE sessions_v2 (
          id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
          active INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          stopped_at INTEGER
        );
        INSERT INTO sessions_v2 (id, guild_id, active, created_at, stopped_at)
          SELECT id, guild_id, active, created_at, stopped_at FROM sessions;
        DROP TABLE sessions;
        ALTER TABLE sessions_v2 RENAME TO sessions;
      `);
    })();
  }

  db.pragma("user_version = 2");
}

import "dotenv/config";
import { createClient } from "@libsql/client";
import path from "node:path";
import { pathToFileURL } from "node:url";

const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const isRemoteDatabase = databaseUrl && !databaseUrl.startsWith("file:");

if (isRemoteDatabase && !authToken) {
  throw new Error("TURSO_AUTH_TOKEN is required for the remote database.");
}

if (
  !databaseUrl &&
  (process.env.NODE_ENV === "production" ||
    process.env.RENDER === "true" ||
    process.env.RENDER_SERVICE_ID)
) {
  throw new Error("TURSO_DATABASE_URL is required in production.");
}

const client = createClient(
  databaseUrl
    ? { url: databaseUrl, ...(authToken ? { authToken } : {}) }
    : {
        url: pathToFileURL(
          path.resolve(process.env.DATABASE_PATH || "database.db")
        ).href,
      }
);

function toPlainRow(result, row) {
  return Object.fromEntries(
    result.columns.map((column, index) => [column, row[index]])
  );
}

const db = {
  async all(sql, args = []) {
    const result = await client.execute({ sql, args });
    return result.rows.map((row) => toPlainRow(result, row));
  },

  async get(sql, args = []) {
    const result = await client.execute({ sql, args });
    const row = result.rows[0];
    return row ? toPlainRow(result, row) : undefined;
  },

  async run(sql, args = []) {
    return client.execute({ sql, args });
  },

  async batch(statements) {
    return client.batch(statements, "write");
  },
};

export async function initializeDatabase() {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.batch(
    [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `,
      },
      {
        sql: `
          CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL DEFAULT 'New conversation',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `,
      },
      {
        sql: `
          CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY,
            conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
            content TEXT NOT NULL CHECK (length(trim(content)) > 0),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `,
      },
      {
        sql: `
          CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
          ON conversations(user_id, updated_at DESC)
        `,
      },
      {
        sql: `
          CREATE INDEX IF NOT EXISTS messages_conversation_idx
          ON messages(conversation_id, id)
        `,
      },
    ],
    "write"
  );

  if (!databaseUrl) {
    console.warn("Using local SQLite file; set Turso credentials for hosted persistence.");
  }
}

export default db;

import Database from "better-sqlite3";
import path from "node:path";

const db = new Database(
  process.env.DATABASE_PATH || path.join(process.cwd(), "database.db")
);
db.pragma("foreign_keys = ON");

export default db;
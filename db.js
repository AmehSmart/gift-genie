import Database from "better-sqlite3";
import path from "node:path";

const db = new Database(path.join(process.cwd(), "database.db"));
db.pragma("foreign_keys = ON");

export default db;
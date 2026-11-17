import { initializeDatabase } from "./db.js";

await initializeDatabase();
console.log("Tables created.");
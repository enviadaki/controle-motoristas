import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, pool } from "./index.js";

// Em dev roda de src/db; no build roda de dist/ — a pasta drizzle/ fica ao lado
// do package.json do server nos dois casos.
const aqui = path.dirname(fileURLToPath(import.meta.url));
const pasta = process.env.MIGRATIONS_DIR ?? path.resolve(aqui, aqui.endsWith("dist") ? "../drizzle" : "../../drizzle");

await migrate(db, { migrationsFolder: pasta });
console.log("Migrations aplicadas a partir de", pasta);
await pool.end();

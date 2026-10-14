import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import { env } from "../env.js";

// numeric -> string no driver pg; mantemos string para não perder centavos.
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export type DB = typeof db;

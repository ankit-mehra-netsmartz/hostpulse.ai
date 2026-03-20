import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { config } from "./config";
import { logger } from "./logger";

const { Pool } = pg;

function getSslConfig(dbUrl: string): false | pg.ConnectionConfig["ssl"] {
  if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) return false;
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") {
    // Explicitly opted-in to skip verification (e.g. certain managed DB providers)
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

export const pool = new Pool({
  connectionString: config.database.url,
  max: 10,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 60000,
  allowExitOnIdle: false,
  ssl: getSslConfig(config.database.url),
});

pool.on("error", (err) => {
  logger.error("Database", "Unexpected database pool error:", err);
});

export const db = drizzle(pool, { schema });

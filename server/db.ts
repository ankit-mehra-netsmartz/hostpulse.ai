import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { config } from "./config";
import { logger } from "./logger";

const { Pool } = pg;

export const pool = new Pool({ 
  connectionString: config.database.url,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: false,
  ssl: config.database.url.includes('localhost') ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  logger.error('Database', 'Unexpected database pool error:', err);
});

export const db = drizzle(pool, { schema });

import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

/**
 * The Supabase transaction pooler (port 6543) does not support prepared
 * statements — omitting `prepare: false` produces intermittent
 * `prepared statement "s1" already exists` errors under concurrency.
 *
 * The client is cached on globalThis so Next's dev HMR does not leak a new
 * connection pool on every reload.
 */
const globalForDb = globalThis as unknown as {
  __docketSql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDb.__docketSql ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__docketSql = sql;
}

export const db = drizzle(sql, { schema });
export type Db = typeof db;

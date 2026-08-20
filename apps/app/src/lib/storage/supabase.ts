import "server-only";

import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";

/**
 * Service-role Storage client. SERVER ONLY — this key bypasses every policy,
 * so it must never reach a client bundle. The "server-only" import above is
 * what makes that a build error rather than a discovery in production.
 */
const globalForStorage = globalThis as unknown as {
  __docketStorage?: ReturnType<typeof createClient>;
};

export const storage =
  globalForStorage.__docketStorage ??
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

if (process.env.NODE_ENV !== "production") {
  globalForStorage.__docketStorage = storage;
}

export const BUCKET = env.SUPABASE_STORAGE_BUCKET;

/** Fails loudly and early rather than at the moment someone uploads a CV. */
export function assertStorageConfigured() {
  if (
    env.SUPABASE_SERVICE_ROLE_KEY.includes("<") ||
    env.SUPABASE_SERVICE_ROLE_KEY.length < 20
  ) {
    return "File storage is not configured. Set SUPABASE_SERVICE_ROLE_KEY in apps/app/.env.local.";
  }
  return null;
}

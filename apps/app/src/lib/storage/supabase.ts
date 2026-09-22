import "server-only";

import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";
import { createLocalStorageClient } from "./local";

/**
 * Service-role Storage client. SERVER ONLY — this key bypasses every policy,
 * so it must never reach a client bundle. The "server-only" import above is
 * what makes that a build error rather than a discovery in production.
 */
const globalForStorage = globalThis as unknown as {
  __docketStorage?: ReturnType<typeof createClient>;
};

// STORAGE_DRIVER=local swaps in a disk-backed client with the same
// upload/remove/createSignedUrl surface (see ./local.ts).
export const storage =
  globalForStorage.__docketStorage ??
  (env.STORAGE_DRIVER === "local"
    ? (createLocalStorageClient() as unknown as ReturnType<typeof createClient>)
    : createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }));

if (process.env.NODE_ENV !== "production") {
  globalForStorage.__docketStorage = storage;
}

export const BUCKET = env.SUPABASE_STORAGE_BUCKET;

/** Fails loudly and early rather than at the moment someone uploads a CV. */
export function assertStorageConfigured() {
  if (env.STORAGE_DRIVER === "local") return null;
  if (
    env.SUPABASE_SERVICE_ROLE_KEY.includes("<") ||
    env.SUPABASE_SERVICE_ROLE_KEY.length < 20
  ) {
    return "File storage is not configured. Set SUPABASE_SERVICE_ROLE_KEY in apps/app/.env.local (the file Next.js reads — a repo-root .env is ignored).";
  }
  return null;
}

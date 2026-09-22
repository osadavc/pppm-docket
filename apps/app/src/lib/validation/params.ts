import { notFound } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Pure check, so it can be unit tested without Next's runtime. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * A record id from the URL, or a 404.
 *
 * Postgres raises an error on `where id = 'not-a-uuid'`, which would surface
 * as a server error page; a malformed link deserves the same "not found" a
 * missing one gets. Staff user ids are not UUIDs, so this is only for record
 * routes (positions, candidates, applications, attachments).
 */
export function parseUuidParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!isUuid(raw)) notFound();
  return raw;
}

const LOCAL_ORIGIN = "http://docket.local";

/**
 * Where to send someone after sign-in, from `?next=`. Only a same-site path
 * is honoured; anything else (absolute URLs, `//host`, `/\host`, which
 * browsers read as `//host`) falls back, so the sign-in page can never be
 * used to bounce a freshly authenticated user to another site.
 */
export function safeNextPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  try {
    const url = new URL(value, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

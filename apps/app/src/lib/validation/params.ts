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

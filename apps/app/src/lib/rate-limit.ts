import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimitBuckets } from "@/db/schema";

export type RateLimitResult = {
  allowed: boolean;
  /** Hits recorded in the current window, including this one. */
  hits: number;
  limit: number;
  /** When the current window ends. */
  resetsAt: Date;
};

/**
 * Fixed-window limiter backed by one Postgres row per key.
 *
 * A single upsert either bumps the counter or, if the window has lapsed,
 * starts a new one — atomic under concurrent requests and identical for every
 * instance behind a load balancer, which is the property a per-process map
 * cannot offer. Read the returned `allowed` before doing any work.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));
  const [row] = await db
    .insert(rateLimitBuckets)
    .values({ key, hits: 1, windowStartedAt: sql`now()` })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        hits: sql`CASE
          WHEN ${rateLimitBuckets.windowStartedAt} < now() - make_interval(secs => ${windowSeconds}) THEN 1
          ELSE ${rateLimitBuckets.hits} + 1
        END`,
        windowStartedAt: sql`CASE
          WHEN ${rateLimitBuckets.windowStartedAt} < now() - make_interval(secs => ${windowSeconds}) THEN now()
          ELSE ${rateLimitBuckets.windowStartedAt}
        END`,
      },
    })
    .returning({
      hits: rateLimitBuckets.hits,
      windowStartedAt: rateLimitBuckets.windowStartedAt,
    });

  return {
    allowed: row.hits <= limit,
    hits: row.hits,
    limit,
    resetsAt: new Date(row.windowStartedAt.getTime() + windowSeconds * 1000),
  };
}

/** Best-effort client address behind the usual proxies; never trusted for auth. */
export function clientAddress(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}

import "server-only";

import { activityLog } from "@/db/schema";
import type { Db } from "@/db/client";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type ActivityInput = {
  actorId: string | null;
  action: string;
  entityType: "user" | "position" | "application" | "interview" | "scorecard";
  entityId: string;
  summary: string;
  applicationId?: string | null;
  positionId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Append an audit entry. Always called with the transaction that performed the
 * mutation, so the log can never disagree with what actually happened.
 */
export async function logActivity(tx: Tx, entry: ActivityInput) {
  await tx.insert(activityLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    summary: entry.summary,
    applicationId: entry.applicationId ?? null,
    positionId: entry.positionId ?? null,
    metadata: entry.metadata ?? null,
  });
}

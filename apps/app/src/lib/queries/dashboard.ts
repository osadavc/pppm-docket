import "server-only";

import { and, desc, eq, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activityLog,
  applications,
  applicationStages,
  candidates,
  positions,
  positionStages,
  user,
} from "@/db/schema";
import { stalledBefore } from "./pipeline";
import { listPendingApprovals } from "./positions";

export type PositionOverview = {
  id: string;
  title: string;
  department: string;
  openings: number;
  active: number;
  /** Active candidates past the red pace threshold in their current stage. */
  stuck: number;
  hired: number;
  /** Active candidates whose current stage gate is feedback_outstanding. */
  blockedOnFeedback: number;
};

/**
 * Active applications whose gate is `feedback_outstanding`, per position, in
 * one statement: the same rule as `evaluateStageGate`, position switch on,
 * stage needs a scorecard, a non-empty active panel, and fewer submissions
 * than min(minScorecards, panel), expressed as SQL so nothing is loaded to be
 * counted.
 */
export async function getBlockedOnFeedbackByPosition(): Promise<Map<string, number>> {
  const rows = await db.execute<{ position_id: string; n: number }>(sql`
    select a.position_id, count(*)::int as n
    from applications a
    join positions p on p.id = a.position_id
    join position_stages s on s.id = a.current_stage_id and s.is_archived = false
    join application_stages ast on ast.application_id = a.id and ast.position_stage_id = s.id
    cross join lateral (
      select count(*)::int as panel
      from position_stage_interviewers psi
      join "user" u on u.id = psi.user_id and u.is_active = true
      where psi.position_stage_id = s.id
    ) pn
    cross join lateral (
      select count(distinct sc.author_id)::int as submitted
      from scorecards sc
      join position_stage_interviewers psi on psi.user_id = sc.author_id and psi.position_stage_id = s.id
      join "user" u on u.id = sc.author_id and u.is_active = true
      where sc.application_stage_id = ast.id and sc.status = 'submitted'
    ) sb
    where a.status = 'active'
      and p.require_feedback_to_advance = true
      and s.requires_scorecard = true
      and pn.panel > 0
      and least(s.min_scorecards, pn.panel) > sb.submitted
    group by a.position_id
  `);
  return new Map(rows.map((r) => [r.position_id, Number(r.n)]));
}

export async function getBlockedOnFeedbackCount() {
  let total = 0;
  for (const n of (await getBlockedOnFeedbackByPosition()).values()) total += n;
  return total;
}

/** Open positions with their headline numbers, all from grouped counts. */
export async function getPositionsOverview(
  now: Date = new Date(),
): Promise<PositionOverview[]> {
  const [open, blocked] = await Promise.all([
    db
      .select({
        id: positions.id,
        title: positions.title,
        department: positions.department,
        openings: positions.openings,
        active: sql<number>`count(*) filter (where ${applications.status} = 'active' and ${positionStages.id} is not null)::int`,
        stuck: sql<number>`count(*) filter (
          where ${applications.status} = 'active'
            and ${positionStages.id} is not null
            and ${applicationStages.enteredAt} <= ${stalledBefore(now).toISOString()}::timestamptz
        )::int`,
        hired: sql<number>`count(*) filter (where ${applications.status} = 'hired')::int`,
      })
      .from(positions)
      .leftJoin(applications, eq(applications.positionId, positions.id))
      // Live stage only, so a candidate parked on an archived stage is not
      // counted as active pipeline.
      .leftJoin(
        positionStages,
        and(
          eq(positionStages.id, applications.currentStageId),
          eq(positionStages.isArchived, false),
        ),
      )
      .leftJoin(
        applicationStages,
        and(
          eq(applicationStages.applicationId, applications.id),
          eq(applicationStages.positionStageId, applications.currentStageId),
        ),
      )
      .where(eq(positions.status, "open"))
      .groupBy(positions.id)
      .orderBy(desc(positions.openedAt)),
    getBlockedOnFeedbackByPosition(),
  ]);

  return open.map((p) => ({
    ...p,
    blockedOnFeedback: blocked.get(p.id) ?? 0,
  }));
}

export async function getPendingApprovals() {
  return listPendingApprovals();
}

export type RecentActivityRow = {
  id: number;
  at: Date;
  action: string;
  summary: string;
  actorName: string | null;
  applicationId: string | null;
  candidateName: string | null;
  positionTitle: string | null;
};

/** The last few application events across every position. */
export async function getRecentActivity(limit = 8): Promise<RecentActivityRow[]> {
  return db
    .select({
      id: activityLog.id,
      at: activityLog.createdAt,
      action: activityLog.action,
      summary: activityLog.summary,
      actorName: user.name,
      applicationId: activityLog.applicationId,
      candidateName: candidates.fullName,
      positionTitle: positions.title,
    })
    .from(activityLog)
    .leftJoin(user, eq(user.id, activityLog.actorId))
    .leftJoin(applications, eq(applications.id, activityLog.applicationId))
    .leftJoin(candidates, eq(candidates.id, applications.candidateId))
    .leftJoin(positions, eq(positions.id, activityLog.positionId))
    .where(
      and(
        eq(activityLog.entityType, "application"),
        like(activityLog.action, "application.%"),
      ),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}

import "server-only";

import { and, desc, eq, exists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  activityLog,
  applications,
  applicationStages,
  candidates,
  notifications,
  positions,
  positionStages,
  scorecards,
  user,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { interviewerCanViewApplication } from "./stage-interviewers";

export type TimelineKind = "stage" | "feedback" | "email";

export type TimelineEntry = {
  id: string;
  kind: TimelineKind;
  at: Date;
  /** Who did it. Null means the system acted. */
  actorName: string | null;
  title: string;
  detail: string | null;
  /** Only ever set for entries the viewer is entitled to see in full. */
  meta: Record<string, unknown> | null;
};

export type ApplicationHeader = {
  id: string;
  status: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  positionId: string;
  positionTitle: string;
  currentStageName: string | null;
  appliedAt: Date;
};

/**
 * Whether this person may open an application at all.
 *
 * HR and management see every application. An interviewer sees only active
 * applications currently at a stage assigned to them — checked against the
 * database, not inferred from how they arrived at the page.
 */
export async function canViewApplication(
  viewer: SessionUser,
  applicationId: string,
) {
  if (!viewer.isActive) return false;
  if (can(viewer.role, "application:view")) return true;
  return interviewerCanViewApplication(viewer.id, applicationId);
}

export async function getApplicationHeader(
  applicationId: string,
): Promise<ApplicationHeader | null> {
  const [row] = await db
    .select({
      id: applications.id,
      status: applications.status,
      candidateId: candidates.id,
      candidateName: candidates.fullName,
      candidateEmail: candidates.email,
      positionId: positions.id,
      positionTitle: positions.title,
      currentStageName: positionStages.name,
      appliedAt: applications.appliedAt,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(positions, eq(positions.id, applications.positionId))
    .leftJoin(
      positionStages,
      eq(positionStages.id, applications.currentStageId),
    )
    .where(eq(applications.id, applicationId));
  return row ?? null;
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_no: "Strong no",
  no: "No",
  yes: "Yes",
  strong_yes: "Strong yes",
};

function activityDetail(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const values = metadata as Record<string, unknown>;
  const note = typeof values.note === "string" ? values.note.trim() : "";
  const overrideReason =
    typeof values.overrideReason === "string"
      ? values.overrideReason.trim()
      : "";

  return (
    [note || null, overrideReason ? `Gate override: ${overrideReason}` : null]
      .filter(Boolean)
      .join("\n") || null
  );
}

/**
 * The merged history of an application: stage transitions, interview feedback
 * and sent email, in one order.
 *
 * Visibility is applied at the server data boundary rather than by hiding rows
 * in the UI. For an interviewer that means three separate rules:
 *
 *  - stage transitions are shown — they need the context of where the
 *    candidate has been;
 *  - a peer's scorecard stays hidden until the viewer has submitted their own
 *    for that same stage, so nobody can anchor their assessment on someone
 *    else's;
 *  - email is between HR and the candidate, so an interviewer sees only
 *    messages actually addressed to them.
 */
export async function getApplicationTimeline(
  applicationId: string,
  viewer: SessionUser,
): Promise<TimelineEntry[]> {
  // This DAL function may be reused outside the guarded application page.
  // Re-check row-level access here so no server caller can turn it into an
  // alternate path to application history or peer feedback.
  if (!(await canViewApplication(viewer, applicationId))) return [];

  const seesEverything = can(viewer.role, "scorecard:read-all");
  const viewerScorecards = alias(scorecards, "viewer_scorecards");

  const [logRows, scorecardRows, emailRows] = await Promise.all([
    db
      .select({
        id: activityLog.id,
        at: activityLog.createdAt,
        action: activityLog.action,
        summary: activityLog.summary,
        metadata: activityLog.metadata,
        actorId: activityLog.actorId,
        actorName: user.name,
      })
      .from(activityLog)
      .leftJoin(user, eq(user.id, activityLog.actorId))
      .where(eq(activityLog.applicationId, applicationId))
      .orderBy(desc(activityLog.createdAt)),

    db
      .select({
        id: scorecards.id,
        submittedAt: scorecards.submittedAt,
        updatedAt: scorecards.updatedAt,
        recommendation: scorecards.recommendation,
        overallScore: scorecards.overallScore,
        strengths: scorecards.strengths,
        authorId: scorecards.authorId,
        authorName: user.name,
        stageName: positionStages.name,
        applicationStageId: scorecards.applicationStageId,
      })
      .from(scorecards)
      .innerJoin(user, eq(user.id, scorecards.authorId))
      .innerJoin(
        applicationStages,
        eq(applicationStages.id, scorecards.applicationStageId),
      )
      .innerJoin(
        positionStages,
        eq(positionStages.id, applicationStages.positionStageId),
      )
      .where(
        and(
          eq(scorecards.applicationId, applicationId),
          eq(scorecards.status, "submitted"),
          seesEverything
            ? undefined
            : exists(
                db
                  .select({ id: viewerScorecards.id })
                  .from(viewerScorecards)
                  .where(
                    and(
                      eq(viewerScorecards.applicationId, applicationId),
                      eq(
                        viewerScorecards.applicationStageId,
                        scorecards.applicationStageId,
                      ),
                      eq(viewerScorecards.authorId, viewer.id),
                      eq(viewerScorecards.status, "submitted"),
                    ),
                  ),
              ),
        ),
      ),

    db
      .select({
        id: notifications.id,
        at: notifications.createdAt,
        sentAt: notifications.sentAt,
        type: notifications.type,
        subject: notifications.subject,
        status: notifications.status,
        recipientEmail: notifications.recipientEmail,
        recipientUserId: notifications.recipientUserId,
      })
      .from(notifications)
      .where(eq(notifications.applicationId, applicationId)),
  ]);

  const entries: TimelineEntry[] = [];
  const visibleFeedbackStages = new Set(
    scorecardRows.map((scorecard) => scorecard.applicationStageId),
  );

  for (const r of logRows) {
    if (!seesEverything && r.action === "scorecard.revised") {
      const metadata =
        r.metadata &&
        typeof r.metadata === "object" &&
        !Array.isArray(r.metadata)
          ? (r.metadata as Record<string, unknown>)
          : null;
      const applicationStageId = metadata?.applicationStageId;
      const isOwn = r.actorId === viewer.id;
      if (
        !isOwn &&
        (typeof applicationStageId !== "string" ||
          !visibleFeedbackStages.has(applicationStageId))
      ) {
        continue;
      }
    }

    entries.push({
      id: `log-${r.id}`,
      kind: r.action.startsWith("scorecard.") ? "feedback" : "stage",
      at: r.at,
      actorName: r.actorName ?? null,
      title: r.summary,
      detail: activityDetail(r.metadata),
      meta: seesEverything
        ? (r.metadata as Record<string, unknown> | null)
        : null,
    });
  }

  for (const s of scorecardRows) {
    const isOwn = s.authorId === viewer.id;

    entries.push({
      id: `scorecard-${s.id}`,
      kind: "feedback",
      // Submitted rows written by the action always have submittedAt. The
      // update time keeps malformed legacy data chronologically useful rather
      // than rendering it at the Unix epoch.
      at: s.submittedAt ?? s.updatedAt,
      actorName: s.authorName,
      title: `${isOwn ? "You" : s.authorName} submitted feedback for “${s.stageName}”`,
      detail:
        [
          s.recommendation ? RECOMMENDATION_LABELS[s.recommendation] : null,
          s.overallScore ? `score ${s.overallScore}` : null,
          s.strengths,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      meta: null,
    });
  }

  for (const e of emailRows) {
    // An interviewer sees only mail addressed to them.
    if (!seesEverything && e.recipientUserId !== viewer.id) continue;

    entries.push({
      id: `email-${e.id}`,
      kind: "email",
      at: e.sentAt ?? e.at,
      actorName: null,
      title: e.subject,
      detail: `${e.status === "sent" ? "Sent to" : `${e.status} —`} ${e.recipientEmail}`,
      meta: null,
    });
  }

  // Newest first: the last thing that happened is what people look for.
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}

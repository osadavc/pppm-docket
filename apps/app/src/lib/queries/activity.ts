import "server-only";

import { and, asc, desc, eq, exists, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  activityLog,
  applications,
  applicationStages,
  attachments,
  candidates,
  notifications,
  positions,
  positionStages,
  scorecardRevisions,
  scorecards,
  user,
} from "@/db/schema";
import type { NotificationStatus } from "@/db/schema/enums";
import type { SessionUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { interviewerCanViewApplication } from "./stage-interviewers";

export type TimelineKind = "stage" | "feedback" | "email";

export type CommunicationSnapshot = {
  recipientEmail: string;
  deliveryEmail: string | null;
  subject: string;
  body: string;
  status: NotificationStatus;
  /** A provider call ended without a verdict; a retry reconciles it. */
  outcomeUnknown: boolean;
  attemptCount: number;
  providerMessageId: string | null;
  createdAt: Date;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
  error: string | null;
};

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
  /** Immutable rendered email and delivery facts, after server authorization. */
  communication: CommunicationSnapshot | null;
};

export type ApplicationHeader = {
  id: string;
  status: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string | null;
  candidateLocation: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  source: string;
  positionId: string;
  positionTitle: string;
  currentStageId: string | null;
  currentStageName: string | null;
  /** When they entered the current stage; drives the pace badge. */
  enteredAt: Date | null;
  appliedAt: Date;
  /** When the application was resolved (hired/rejected), if it was. */
  decisionAt: Date | null;
  rejectionReason: string | null;
  decisionReason: string | null;
  /** From the public form; the page shows it to HR and management only. */
  salaryExpectation: string | null;
  /** Null when the candidate applied from the careers site. */
  createdByName: string | null;
  cv: { attachmentId: string; fileName: string; mimeType: string } | null;
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
      candidatePhone: candidates.phone,
      candidateLocation: candidates.location,
      currentTitle: candidates.currentTitle,
      currentCompany: candidates.currentCompany,
      source: candidates.source,
      positionId: positions.id,
      positionTitle: positions.title,
      currentStageId: applications.currentStageId,
      currentStageName: positionStages.name,
      enteredAt: applicationStages.enteredAt,
      appliedAt: applications.appliedAt,
      decisionAt: applications.decisionAt,
      rejectionReason: applications.rejectionReason,
      decisionReason: applications.decisionReason,
      salaryExpectation: applications.salaryExpectation,
      createdByName: user.name,
      cvAttachmentId: attachments.id,
      cvFileName: attachments.fileName,
      cvMimeType: attachments.mimeType,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(positions, eq(positions.id, applications.positionId))
    .leftJoin(
      positionStages,
      eq(positionStages.id, applications.currentStageId),
    )
    .leftJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applications.id),
        eq(applicationStages.positionStageId, applications.currentStageId),
      ),
    )
    .leftJoin(user, eq(user.id, applications.createdById))
    .leftJoin(
      attachments,
      and(
        eq(attachments.applicationId, applications.id),
        eq(attachments.kind, "cv"),
      ),
    )
    .where(eq(applications.id, applicationId))
    .orderBy(desc(attachments.createdAt))
    .limit(1);
  if (!row) return null;
  const { cvAttachmentId, cvFileName, cvMimeType, ...header } = row;
  return {
    ...header,
    cv:
      cvAttachmentId && cvFileName && cvMimeType
        ? { attachmentId: cvAttachmentId, fileName: cvFileName, mimeType: cvMimeType }
        : null,
  };
}

export type StepperStage = {
  id: string;
  name: string;
  orderIndex: number;
  isArchived: boolean;
  /** This application's progress row, if the stage was ever materialised. */
  progress: "pending" | "in_progress" | "passed" | "failed" | "skipped" | null;
  isCurrent: boolean;
};

/**
 * Every live stage of the position plus any archived stage this candidate
 * actually visited, in pipeline order. Archived stages nobody visited are
 * omitted: they were never part of this candidate's journey.
 */
export async function getApplicationStepper(
  applicationId: string,
): Promise<StepperStage[]> {
  const [app] = await db
    .select({ positionId: applications.positionId, currentStageId: applications.currentStageId })
    .from(applications)
    .where(eq(applications.id, applicationId));
  if (!app) return [];

  const rows = await db
    .select({
      id: positionStages.id,
      name: positionStages.name,
      orderIndex: positionStages.orderIndex,
      isArchived: positionStages.isArchived,
      progress: applicationStages.status,
      enteredAt: applicationStages.enteredAt,
    })
    .from(positionStages)
    .leftJoin(
      applicationStages,
      and(
        eq(applicationStages.positionStageId, positionStages.id),
        eq(applicationStages.applicationId, applicationId),
      ),
    )
    .where(eq(positionStages.positionId, app.positionId))
    .orderBy(asc(positionStages.orderIndex), asc(positionStages.name));

  return rows
    .filter((r) => !r.isArchived || (r.progress !== null && r.progress !== "pending") || r.id === app.currentStageId)
    .map((r) => ({
      id: r.id,
      name: r.name,
      orderIndex: r.orderIndex,
      isArchived: r.isArchived,
      progress: r.progress,
      isCurrent: r.id === app.currentStageId,
    }));
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_no: "Strong no",
  no: "No",
  yes: "Yes",
  strong_yes: "Strong yes",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function feedbackSummary(
  recommendation: unknown,
  overallScore: unknown,
  narrative?: unknown,
) {
  return (
    [
      typeof recommendation === "string"
        ? RECOMMENDATION_LABELS[recommendation]
        : null,
      overallScore !== null && overallScore !== undefined && overallScore !== ""
        ? `score ${overallScore}`
        : null,
      typeof narrative === "string" && narrative.trim() ? narrative.trim() : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
}

/**
 * The line under a log entry that everyone entitled to the entry may read.
 * The override reason is deliberately *not* here — it is surfaced through
 * `meta`, which is only populated for HR and management.
 */
function activityDetail(action: string, metadata: unknown): string | null {
  const values = asRecord(metadata);
  if (!values) return null;

  if (action === "scorecard.updated" || action === "scorecard.revised") {
    const current = asRecord(values.current);
    return current
      ? feedbackSummary(current.recommendation, current.overallScore)
      : null;
  }

  const note = typeof values.note === "string" ? values.note.trim() : "";
  return note || null;
}

/**
 * Who to credit when no staff member acted. A public application is the
 * candidate's own doing and is labelled as such rather than left blank, so
 * "nobody" is never mistaken for "HR forgot to record it".
 */
function systemActorLabel(metadata: unknown): string | null {
  const values = asRecord(metadata);
  if (values?.origin === "candidate" || values?.source === "careers_site" || values?.origin === "careers_site") {
    return "Candidate via careers site";
  }
  return "System";
}

/** What HR and management additionally see on an entry. */
function privilegedMeta(metadata: unknown): Record<string, unknown> | null {
  const values = asRecord(metadata);
  if (!values) return null;

  const overrideReason =
    typeof values.overrideReason === "string" ? values.overrideReason.trim() : "";
  const outstanding = Array.isArray(values.outstandingInterviewers)
    ? values.outstandingInterviewers.filter(
        (name): name is string => typeof name === "string",
      )
    : [];

  return {
    ...values,
    overrideReason: overrideReason || null,
    outstandingInterviewers: outstanding,
  };
}

/**
 * The merged history of an application: stage transitions, interview feedback
 * and candidate communication, in one order.
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
      // Submission is rendered from the authorized scorecard query below.
      // Excluding its audit event here prevents both duplicate timeline rows
      // and a side channel around same-stage feedback visibility.
      .where(
        and(
          eq(activityLog.applicationId, applicationId),
          ne(activityLog.action, "scorecard.submitted"),
        ),
      )
      .orderBy(desc(activityLog.createdAt)),

    db
      .select({
        id: scorecards.id,
        submittedAt: scorecards.submittedAt,
        updatedAt: scorecards.updatedAt,
        recommendation: scorecards.recommendation,
        overallScore: scorecards.overallScore,
        strengths: scorecards.strengths,
        // What was actually submitted, before any later edit. Revision 1 is
        // written with the submission; older rows without one fall back to
        // the live values.
        submittedRecommendation: scorecardRevisions.recommendation,
        submittedScore: scorecardRevisions.overallScore,
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
      .leftJoin(
        scorecardRevisions,
        and(
          eq(scorecardRevisions.scorecardId, scorecards.id),
          eq(scorecardRevisions.revisionNumber, 1),
        ),
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
        subject: notifications.subject,
        status: notifications.status,
        body: notifications.body,
        recipientEmail: notifications.recipientEmail,
        deliveryEmail: notifications.deliveryEmail,
        providerMessageId: notifications.providerMessageId,
        error: notifications.error,
        attemptCount: notifications.attemptCount,
        lastAttemptAt: notifications.lastAttemptAt,
        metadata: notifications.metadata,
        actorName: user.name,
      })
      .from(notifications)
      .leftJoin(user, eq(user.id, notifications.actorId))
      .where(
        and(
          eq(notifications.applicationId, applicationId),
          // Candidate mail has no recipientUserId. Keeping this condition in
          // SQL means its rendered body never enters an interviewer response.
          seesEverything
            ? undefined
            : eq(notifications.recipientUserId, viewer.id),
        ),
      ),
  ]);

  const entries: TimelineEntry[] = [];
  const visibleFeedbackStages = new Set(
    scorecardRows.map((scorecard) => scorecard.applicationStageId),
  );

  for (const r of logRows) {
    if (
      !seesEverything &&
      (r.action === "scorecard.revised" || r.action === "scorecard.updated")
    ) {
      // Same-stage peer rule, applied to revision events exactly as it is to
      // the scorecards themselves: visible once the viewer has submitted for
      // that stage, or when it is their own.
      const metadata = asRecord(r.metadata);
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
      actorName: r.actorName ?? (r.actorId ? null : systemActorLabel(r.metadata)),
      title: r.summary,
      detail: activityDetail(r.action, r.metadata),
      meta: seesEverything ? privilegedMeta(r.metadata) : null,
      communication: null,
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
      detail: feedbackSummary(
        s.submittedRecommendation ?? s.recommendation,
        s.submittedScore ?? s.overallScore,
        s.strengths,
      ),
      meta: null,
      communication: null,
    });
  }

  for (const e of emailRows) {
    const outcomeUnknown = e.metadata?.outcome === "unknown";
    const emailDetail = (() => {
      if (e.status === "sent") {
        return `Sent to ${e.deliveryEmail ?? e.recipientEmail}${e.deliveryEmail && e.deliveryEmail !== e.recipientEmail ? ` (redirected; intended for ${e.recipientEmail})` : ""}`;
      }
      if (e.status === "simulated") {
        return `Simulated — recorded, not sent · intended for ${e.recipientEmail}`;
      }
      if (e.status === "failed") {
        const attempts = `${e.attemptCount} attempt${e.attemptCount === 1 ? "" : "s"}`;
        return `Delivery failed for ${e.recipientEmail} · ${attempts}${e.error ? ` · ${e.error}` : ""}`;
      }
      if (e.status === "dispatching") {
        return outcomeUnknown
          ? `Delivery outcome unknown for ${e.recipientEmail} · retry to reconcile${e.error ? ` · ${e.error}` : ""}`
          : `Dispatching to ${e.deliveryEmail ?? e.recipientEmail}`;
      }
      return `Queued for ${e.recipientEmail}`;
    })();

    entries.push({
      id: `email-${e.id}`,
      kind: "email",
      // This is the time the named actor initiated the communication. Outcome
      // timestamps remain available in the inspectable delivery facts below.
      at: e.at,
      actorName: e.actorName ?? systemActorLabel(e.metadata),
      title: e.subject,
      detail: emailDetail,
      meta: null,
      communication: {
        recipientEmail: e.recipientEmail,
        deliveryEmail: e.deliveryEmail,
        subject: e.subject,
        body: e.body,
        status: e.status,
        outcomeUnknown,
        attemptCount: e.attemptCount,
        providerMessageId: e.providerMessageId,
        createdAt: e.at,
        lastAttemptAt: e.lastAttemptAt,
        sentAt: e.sentAt,
        error: e.error,
      },
    });
  }

  // Newest first: the last thing that happened is what people look for.
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export type PositionActivityRow = {
  id: number;
  at: Date;
  action: string;
  summary: string;
  actorName: string | null;
  /** Populated for HR/management; contains notes and before/after values. */
  meta: Record<string, unknown> | null;
};

/**
 * Everything logged against a position itself: created, updated, submitted,
 * approved/sent back, stage and panel changes, filled/closed/cancelled.
 * Candidate events carry a position_id too but belong on the candidate's own
 * timeline, so they are excluded here.
 */
export async function getPositionActivity(
  positionId: string,
  viewer: SessionUser,
  limit = 50,
): Promise<PositionActivityRow[]> {
  if (!viewer.isActive || !can(viewer.role, "position:view")) return [];

  const rows = await db
    .select({
      id: activityLog.id,
      at: activityLog.createdAt,
      action: activityLog.action,
      summary: activityLog.summary,
      metadata: activityLog.metadata,
      actorName: user.name,
    })
    .from(activityLog)
    .leftJoin(user, eq(user.id, activityLog.actorId))
    .where(
      and(
        eq(activityLog.positionId, positionId),
        eq(activityLog.entityType, "position"),
      ),
    )
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    action: r.action,
    summary: r.summary,
    actorName: r.actorName,
    meta: asRecord(r.metadata),
  }));
}

export type ApprovalEvent = {
  id: number;
  kind: "requested" | "approved" | "sent_back";
  actorName: string | null;
  at: Date;
  note: string | null;
};

/**
 * Every approval cycle, oldest first, read from the activity log rather than
 * from the position row: the row keeps only the latest decision, and a role
 * that was sent back twice before being approved has three stories to tell.
 */
export async function getApprovalHistory(positionId: string): Promise<ApprovalEvent[]> {
  const rows = await db
    .select({
      id: activityLog.id,
      at: activityLog.createdAt,
      action: activityLog.action,
      metadata: activityLog.metadata,
      actorName: user.name,
    })
    .from(activityLog)
    .leftJoin(user, eq(user.id, activityLog.actorId))
    .where(
      and(
        eq(activityLog.positionId, positionId),
        inArray(activityLog.action, [
          "position.submitted_for_approval",
          "position.approved",
          "position.rejected",
        ]),
      ),
    )
    .orderBy(asc(activityLog.createdAt), asc(activityLog.id));

  return rows.map((r) => {
    const note = asRecord(r.metadata)?.note;
    return {
      id: r.id,
      kind:
        r.action === "position.submitted_for_approval"
          ? "requested"
          : r.action === "position.approved"
            ? "approved"
            : "sent_back",
      actorName: r.actorName,
      at: r.at,
      note: typeof note === "string" && note.trim() ? note.trim() : null,
    };
  });
}

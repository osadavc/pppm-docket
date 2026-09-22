"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  candidates,
  interviewParticipants,
  interviews,
  positionStages,
  user,
} from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/format";
import {
  cancelInterviewSchema,
  scheduleInterviewSchema,
  type CancelInterviewInput,
  type ScheduleInterviewInput,
} from "@/lib/validation/interview";
import { fail, ok, type ActionResult } from "./result";

const revalidateApplication = (applicationId: string, positionId: string) => {
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/positions/${positionId}/pipeline`);
  revalidatePath("/queue");
};

/**
 * Book an interview for the candidate's current stage. Its lead and
 * interviewers become this candidate's panel for the stage, replacing the
 * stage's standing panel (see the application_stage_panels view).
 */
export async function scheduleInterview(
  input: ScheduleInterviewInput,
): Promise<ActionResult<{ interviewId: string }>> {
  const actor = await requirePermission("application:manage");
  const parsed = scheduleInterviewSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const v = parsed.data;

  const [context] = await db
    .select({
      status: applications.status,
      positionId: applications.positionId,
      candidateName: candidates.fullName,
      stageName: positionStages.name,
      applicationStageId: applicationStages.id,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(positionStages, eq(positionStages.id, applications.currentStageId))
    .innerJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applications.id),
        eq(applicationStages.positionStageId, applications.currentStageId),
      ),
    )
    .where(eq(applications.id, v.applicationId));

  if (!context) return fail("This application has no current stage to schedule for.");
  if (context.status !== "active") {
    return fail(`${context.candidateName} is not active, so no interview can be booked.`);
  }

  const interviewerIds = [...new Set(v.interviewerIds)];
  const people = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(inArray(user.id, interviewerIds), eq(user.isActive, true)));
  if (people.length !== interviewerIds.length) {
    return fail("One of the chosen interviewers no longer has an active account.");
  }

  const scheduledAt = new Date(v.scheduledAt);
  const interviewId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(interviews)
      .values({
        applicationId: v.applicationId,
        applicationStageId: context.applicationStageId,
        title: v.title || null,
        scheduledAt,
        durationMinutes: v.durationMinutes,
        mode: v.mode,
        location: v.location || null,
        meetingUrl: v.meetingUrl || null,
        notesForInterviewers: v.notesForInterviewers || null,
        createdById: actor.id,
      })
      .returning({ id: interviews.id });

    await tx.insert(interviewParticipants).values(
      interviewerIds.map((userId) => ({
        interviewId: created!.id,
        userId,
        role: userId === v.leadId ? ("lead" as const) : ("interviewer" as const),
      })),
    );

    await logActivity(tx, {
      actorId: actor.id,
      action: "interview.scheduled",
      entityType: "interview",
      entityId: created!.id,
      applicationId: v.applicationId,
      positionId: context.positionId,
      summary: `${actor.name} scheduled “${context.stageName}” with ${context.candidateName} for ${formatDateTime(scheduledAt)}, with ${people.map((p) => p.name).join(", ")}`,
      metadata: { interviewerIds, leadId: v.leadId ?? null, mode: v.mode },
    });

    return created!.id;
  });

  revalidateApplication(v.applicationId, context.positionId);
  return ok({ interviewId });
}

export async function cancelInterview(
  input: CancelInterviewInput,
): Promise<ActionResult> {
  const actor = await requirePermission("application:manage");
  const parsed = cancelInterviewSchema.safeParse(input);
  if (!parsed.success) return fail("That interview could not be found.");

  const [row] = await db
    .select({
      status: interviews.status,
      applicationId: interviews.applicationId,
      positionId: applications.positionId,
      candidateName: candidates.fullName,
      stageName: positionStages.name,
    })
    .from(interviews)
    .innerJoin(applications, eq(applications.id, interviews.applicationId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(applicationStages, eq(applicationStages.id, interviews.applicationStageId))
    .innerJoin(positionStages, eq(positionStages.id, applicationStages.positionStageId))
    .where(eq(interviews.id, parsed.data.interviewId));

  if (!row) return fail("That interview could not be found.");
  if (row.status === "cancelled") return fail("This interview is already cancelled.");

  await db.transaction(async (tx) => {
    await tx
      .update(interviews)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: parsed.data.reason || null,
      })
      .where(eq(interviews.id, parsed.data.interviewId));

    await logActivity(tx, {
      actorId: actor.id,
      action: "interview.cancelled",
      entityType: "interview",
      entityId: parsed.data.interviewId,
      applicationId: row.applicationId,
      positionId: row.positionId,
      summary: `${actor.name} cancelled the “${row.stageName}” interview with ${row.candidateName}`,
      metadata: parsed.data.reason ? { reason: parsed.data.reason } : null,
    });
  });

  revalidateApplication(row.applicationId, row.positionId);
  return ok(undefined);
}

import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  interviewParticipants,
  interviews,
  positionStageInterviewers,
  positionStages,
  user,
} from "@/db/schema";

export type InterviewParticipantView = {
  userId: string;
  name: string;
  role: "lead" | "interviewer" | "observer";
};

export type InterviewView = {
  id: string;
  applicationStageId: string;
  stageName: string;
  title: string | null;
  scheduledAt: Date;
  durationMinutes: number;
  mode: "onsite" | "video" | "phone";
  location: string | null;
  meetingUrl: string | null;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  notesForInterviewers: string | null;
  cancelReason: string | null;
  participants: InterviewParticipantView[];
};

/** The application-stage row for where the candidate sits now, with its standing panel. */
export async function getCurrentStageForScheduling(applicationId: string) {
  const [row] = await db
    .select({
      applicationStageId: applicationStages.id,
      positionStageId: positionStages.id,
      stageName: positionStages.name,
    })
    .from(applications)
    .innerJoin(positionStages, eq(positionStages.id, applications.currentStageId))
    .innerJoin(
      applicationStages,
      and(
        eq(applicationStages.applicationId, applications.id),
        eq(applicationStages.positionStageId, applications.currentStageId),
      ),
    )
    .where(eq(applications.id, applicationId));
  if (!row) return null;

  const standing = await db
    .select({ userId: positionStageInterviewers.userId })
    .from(positionStageInterviewers)
    .innerJoin(user, and(eq(user.id, positionStageInterviewers.userId), eq(user.isActive, true)))
    .where(eq(positionStageInterviewers.positionStageId, row.positionStageId));

  return { ...row, standingPanelIds: standing.map((s) => s.userId) };
}

export async function listInterviewsForApplication(
  applicationId: string,
): Promise<InterviewView[]> {
  const rows = await db
    .select({
      id: interviews.id,
      applicationStageId: interviews.applicationStageId,
      stageName: positionStages.name,
      title: interviews.title,
      scheduledAt: interviews.scheduledAt,
      durationMinutes: interviews.durationMinutes,
      mode: interviews.mode,
      location: interviews.location,
      meetingUrl: interviews.meetingUrl,
      status: interviews.status,
      notesForInterviewers: interviews.notesForInterviewers,
      cancelReason: interviews.cancelReason,
    })
    .from(interviews)
    .innerJoin(applicationStages, eq(applicationStages.id, interviews.applicationStageId))
    .innerJoin(positionStages, eq(positionStages.id, applicationStages.positionStageId))
    .where(eq(interviews.applicationId, applicationId))
    .orderBy(desc(interviews.scheduledAt));

  if (rows.length === 0) return [];

  const people = await db
    .select({
      interviewId: interviewParticipants.interviewId,
      userId: interviewParticipants.userId,
      name: user.name,
      role: interviewParticipants.role,
    })
    .from(interviewParticipants)
    .innerJoin(user, eq(user.id, interviewParticipants.userId))
    .where(inArray(interviewParticipants.interviewId, rows.map((r) => r.id)))
    .orderBy(asc(user.name));

  return rows.map((r) => ({
    ...r,
    status: r.status as InterviewView["status"],
    participants: people
      .filter((p) => p.interviewId === r.id)
      .map(({ userId, name, role }) => ({ userId, name, role }))
      .sort((a, b) => Number(b.role === "lead") - Number(a.role === "lead")),
  }));
}

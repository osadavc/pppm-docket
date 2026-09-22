import assert from "node:assert/strict";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applications,
  applicationStages,
  attachments,
  activityLog,
  candidates,
  positions,
  positionStageInterviewers,
  positionStages,
  scorecards,
  user,
} from "@/db/schema";
import { getMyQueue, QUEUE_PAGE_SIZE } from "./queue";
import { getAdvanceContext } from "./applications";
import { getApplicationTimeline } from "./activity";
import { interviewerCanViewApplication } from "./stage-interviewers";
import { createUnassignedInterviewer } from "./test-interviewer";

test(
  "assigned queue is bounded, gate-aware, and access stays current-stage-or-author",
  { timeout: 30_000 },
  async () => {
    const seededUsers = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(
        inArray(user.email, [
          "hr@example.com",
          "interviewone@example.com",
          "interviewtwo@example.com",
        ]),
      );
    const userId = (email: string) =>
      seededUsers.find((row) => row.email === email)?.id;
    const hrId = userId("hr@example.com");
    const viewerId = userId("interviewone@example.com");
    const panelPeerId = userId("interviewtwo@example.com");

    if (!hrId || !viewerId || !panelPeerId) {
      throw new Error(
        "Run `bun run db:seed` before the queue integration test.",
      );
    }
    const unassigned = await createUnassignedInterviewer();
    const unassignedId = unassigned.id;

    const marker = crypto.randomUUID();
    const now = new Date();
    const baseline = await getMyQueue(viewerId, 1, now);
    const [position] = await db
      .insert(positions)
      .values({
        title: `Queue integration ${marker}`,
        department: "Test",
        description: "Synthetic queue integration position",
        status: "open",
        requireFeedbackToAdvance: true,
        createdById: hrId,
      })
      .returning({ id: positions.id });
    const candidateIds: string[] = [];
    let submissionActivityId: number | undefined;

    try {
      const [stage] = await db
        .insert(positionStages)
        .values({
          positionId: position.id,
          name: "Panel interview",
          orderIndex: 0,
          requiresScorecard: true,
          minScorecards: 1,
        })
        .returning({ id: positionStages.id });

      await db.insert(positionStageInterviewers).values([
        { positionStageId: stage.id, userId: viewerId },
        { positionStageId: stage.id, userId: panelPeerId },
      ]);

      const candidateValues = Array.from(
        { length: QUEUE_PAGE_SIZE + 3 },
        (_, index) => ({
          fullName: `Queue Candidate ${String(index).padStart(2, "0")}`,
          email: `queue-${marker}-${index}@docket.test`,
          currentTitle: "Synthetic candidate",
          createdById: hrId,
        }),
      );
      const candidateRows = await db
        .insert(candidates)
        .values(candidateValues)
        .returning({ id: candidates.id, fullName: candidates.fullName });
      candidateIds.push(...candidateRows.map((candidate) => candidate.id));
      const candidateByName = new Map(
        candidateRows.map((candidate) => [candidate.fullName, candidate.id]),
      );

      const activeCandidateNames = candidateValues
        .slice(0, QUEUE_PAGE_SIZE + 2)
        .map((candidate) => candidate.fullName);
      const applicationRows = await db
        .insert(applications)
        .values(
          candidateValues.map((candidate, index) => ({
            candidateId: candidateByName.get(candidate.fullName)!,
            positionId: position.id,
            currentStageId: stage.id,
            status:
              index === QUEUE_PAGE_SIZE + 2
                ? ("withdrawn" as const)
                : ("active" as const),
            createdById: hrId,
          })),
        )
        .returning({
          id: applications.id,
          candidateId: applications.candidateId,
          status: applications.status,
        });
      const applicationByCandidateId = new Map(
        applicationRows.map((application) => [
          application.candidateId,
          application,
        ]),
      );

      const applicationStageRows = await db
        .insert(applicationStages)
        .values(
          candidateValues.map((candidate, index) => ({
            applicationId: applicationByCandidateId.get(
              candidateByName.get(candidate.fullName)!,
            )!.id,
            positionStageId: stage.id,
            orderIndex: 0,
            status:
              index === QUEUE_PAGE_SIZE + 2
                ? ("passed" as const)
                : ("in_progress" as const),
            enteredAt: new Date(
              now.getTime() - (QUEUE_PAGE_SIZE + 3 - index) * 86_400_000,
            ),
          })),
        )
        .returning({
          id: applicationStages.id,
          applicationId: applicationStages.applicationId,
        });
      const applicationStageByApplicationId = new Map(
        applicationStageRows.map((applicationStage) => [
          applicationStage.applicationId,
          applicationStage.id,
        ]),
      );
      const applicationFor = (name: string) =>
        applicationByCandidateId.get(candidateByName.get(name)!)!;
      const applicationStageFor = (name: string) =>
        applicationStageByApplicationId.get(applicationFor(name).id)!;

      await db.insert(scorecards).values([
        {
          applicationId: applicationFor("Queue Candidate 00").id,
          applicationStageId: applicationStageFor("Queue Candidate 00"),
          authorId: panelPeerId,
          status: "submitted",
          recommendation: "yes",
          submittedAt: now,
        },
        ...["Queue Candidate 50", "Queue Candidate 51"].map((name) => ({
          applicationId: applicationFor(name).id,
          applicationStageId: applicationStageFor(name),
          authorId: viewerId,
          status: "submitted" as const,
          recommendation: "yes" as const,
          submittedAt: now,
        })),
      ]);

      const [cv] = await db
        .insert(attachments)
        .values({
          kind: "cv",
          candidateId: candidateByName.get("Queue Candidate 00"),
          applicationId: applicationFor("Queue Candidate 00").id,
          storagePath: `queue-integration/${marker}/cv.pdf`,
          fileName: "candidate-00-cv.pdf",
          mimeType: "application/pdf",
          sizeBytes: 128,
          uploadedById: hrId,
        })
        .returning({ id: attachments.id });

      const firstPage = await getMyQueue(viewerId, 1, now);
      const pages = [firstPage];
      for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
        pages.push(await getMyQueue(viewerId, page, now));
      }
      const syntheticAwaiting = pages
        .flatMap((page) => page.awaiting)
        .filter((candidate) =>
          candidate.candidateName.startsWith("Queue Candidate"),
        );
      const syntheticSubmitted = pages
        .flatMap((page) => page.submitted)
        .filter((candidate) =>
          candidate.candidateName.startsWith("Queue Candidate"),
        );

      assert.equal(
        firstPage.summary.total,
        baseline.summary.total + QUEUE_PAGE_SIZE + 2,
      );
      assert.equal(
        firstPage.summary.awaiting,
        baseline.summary.awaiting + QUEUE_PAGE_SIZE,
      );
      assert.equal(firstPage.summary.submitted, baseline.summary.submitted + 2);
      assert.deepEqual(
        syntheticAwaiting.map((candidate) => candidate.candidateName),
        activeCandidateNames.slice(0, QUEUE_PAGE_SIZE),
      );
      assert.deepEqual(
        syntheticSubmitted.map((candidate) => candidate.candidateName),
        ["Queue Candidate 50", "Queue Candidate 51"],
      );
      assert.equal(syntheticAwaiting[0].cvAttachmentId, cv.id);
      assert.equal(syntheticAwaiting[0].gate.blocked, false);
      assert.equal(syntheticAwaiting[1].gate.blocked, true);
      assert.equal(syntheticAwaiting[1].gate.outstanding, 1);
      assert.ok(
        pages.every(
          (page) =>
            page.awaiting.length + page.submitted.length <= QUEUE_PAGE_SIZE,
        ),
      );

      const accessApplication = applicationFor("Queue Candidate 01");
      assert.equal(
        await interviewerCanViewApplication(viewerId, accessApplication.id),
        true,
      );
      assert.equal(
        await interviewerCanViewApplication(unassignedId, accessApplication.id),
        false,
      );

      await db.insert(scorecards).values({
        applicationId: accessApplication.id,
        applicationStageId: applicationStageFor("Queue Candidate 01"),
        authorId: unassignedId,
        status: "submitted",
        recommendation: "yes",
        submittedAt: now,
      });
      assert.equal(
        await interviewerCanViewApplication(unassignedId, accessApplication.id),
        true,
      );

      const inactiveApplication = applicationRows.find(
        (application) => application.status === "withdrawn",
      )!;
      assert.equal(
        await interviewerCanViewApplication(viewerId, inactiveApplication.id),
        false,
      );

      const gateApplication = applicationFor("Queue Candidate 00");
      let advanceContext = await getAdvanceContext(gateApplication.id);
      assert.equal(advanceContext?.gate.required, 1);
      assert.equal(advanceContext?.gate.blocked, false);

      await db
        .update(positionStages)
        .set({ minScorecards: 2 })
        .where(eq(positionStages.id, stage.id));
      advanceContext = await getAdvanceContext(gateApplication.id);
      assert.equal(advanceContext?.gate.required, 2);
      assert.equal(advanceContext?.gate.outstanding, 1);

      const [viewerSubmission] = await db
        .insert(scorecards)
        .values({
          applicationId: gateApplication.id,
          applicationStageId: applicationStageFor("Queue Candidate 00"),
          authorId: viewerId,
          status: "submitted",
          recommendation: "strong_yes",
          submittedAt: now,
        })
        .returning({ id: scorecards.id });
      const [submissionActivity] = await db
        .insert(activityLog)
        .values({
          actorId: viewerId,
          action: "scorecard.submitted",
          entityType: "scorecard",
          entityId: viewerSubmission.id,
          applicationId: gateApplication.id,
          positionId: position.id,
          summary: "Synthetic scorecard submission audit event",
          metadata: {
            applicationStageId: applicationStageFor("Queue Candidate 00"),
          },
        })
        .returning({ id: activityLog.id });
      submissionActivityId = submissionActivity.id;

      const timeline = await getApplicationTimeline(gateApplication.id, {
        id: viewerId,
        name: "Queue integration viewer",
        email: "interviewone@example.com",
        role: "interviewer",
        isActive: true,
      });
      assert.equal(
        timeline.filter(
          (entry) => entry.id === `scorecard-${viewerSubmission.id}`,
        ).length,
        1,
      );
      assert.equal(
        timeline.some((entry) => entry.id === `log-${submissionActivity.id}`),
        false,
      );
      advanceContext = await getAdvanceContext(gateApplication.id);
      assert.equal(advanceContext?.gate.blocked, false);

      await db
        .delete(positionStageInterviewers)
        .where(
          and(
            eq(positionStageInterviewers.positionStageId, stage.id),
            eq(positionStageInterviewers.userId, panelPeerId),
          ),
        );
      advanceContext = await getAdvanceContext(gateApplication.id);
      assert.equal(advanceContext?.gate.required, 1);
      assert.equal(advanceContext?.gate.blocked, false);
      assert.deepEqual(advanceContext?.outstandingInterviewers, []);

      await db
        .delete(positionStageInterviewers)
        .where(
          and(
            eq(positionStageInterviewers.positionStageId, stage.id),
            eq(positionStageInterviewers.userId, viewerId),
          ),
        );
      advanceContext = await getAdvanceContext(gateApplication.id);
      assert.equal(advanceContext?.gate.reason, "no_interviewers_assigned");
      assert.equal(advanceContext?.gate.blocked, false);
    } finally {
      if (submissionActivityId !== undefined) {
        await db
          .delete(activityLog)
          .where(eq(activityLog.id, submissionActivityId));
      }
      await db.delete(positions).where(eq(positions.id, position.id));
      if (candidateIds.length > 0) {
        await db.delete(candidates).where(inArray(candidates.id, candidateIds));
      }
      await unassigned.remove();
    }
  },
);

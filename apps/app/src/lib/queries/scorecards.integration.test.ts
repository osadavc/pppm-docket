import assert from "node:assert/strict";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  applicationStages,
  applications,
  candidates,
  positions,
  positionStageInterviewers,
  positionStages,
  scorecardCriteria,
  scorecardRatings,
  scorecards,
  user,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/guards";
import { isUserRole } from "@/lib/auth/roles";
import { listScorecardsForApplication } from "./scorecards";
import { createUnassignedInterviewer } from "./test-interviewer";

test(
  "application scorecards keep peer feedback independent by application-stage",
  { timeout: 30_000 },
  async () => {
    const seededUsers = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      })
      .from(user)
      .where(
        inArray(user.email, [
          "hr@example.com",
          "management@example.com",
          "interviewone@example.com",
          "interviewtwo@example.com",
        ]),
      );
    const seededUser = (email: string) =>
      seededUsers.find((row) => row.email === email);
    const asViewer = (email: string): SessionUser => {
      const row = seededUser(email);
      if (!row || !isUserRole(row.role)) {
        throw new Error("Run `bun run db:seed` before this integration test.");
      }
      return { ...row, role: row.role };
    };

    const hr = asViewer("hr@example.com");
    const manager = asViewer("management@example.com");
    const interviewer = asViewer("interviewone@example.com");
    const peer = asViewer("interviewtwo@example.com");
    const { remove: removeUnassigned, ...unassigned } = await createUnassignedInterviewer();
    const marker = crypto.randomUUID();
    const now = new Date();

    const [position] = await db
      .insert(positions)
      .values({
        title: `Scorecard visibility ${marker}`,
        department: "Test",
        description: "Synthetic scorecard visibility position",
        status: "open",
        createdById: hr.id,
      })
      .returning({ id: positions.id });
    let candidateId: string | undefined;
    let applicationId: string | undefined;

    try {
      const [firstStage, secondStage, thirdStage] = await db
        .insert(positionStages)
        .values([
          {
            positionId: position.id,
            name: "Technical interview",
            orderIndex: 0,
          },
          {
            positionId: position.id,
            name: "Final interview",
            orderIndex: 1,
          },
          {
            positionId: position.id,
            name: "Executive interview",
            orderIndex: 2,
          },
        ])
        .returning({ id: positionStages.id, name: positionStages.name });
      await db.insert(positionStageInterviewers).values([
        { positionStageId: firstStage.id, userId: interviewer.id },
        { positionStageId: firstStage.id, userId: peer.id },
      ]);

      const [candidate] = await db
        .insert(candidates)
        .values({
          fullName: `Scorecard Candidate ${marker}`,
          email: `scorecard-${marker}@docket.test`,
          currentTitle: "Synthetic candidate",
          createdById: hr.id,
        })
        .returning({ id: candidates.id });
      candidateId = candidate.id;
      const [application] = await db
        .insert(applications)
        .values({
          candidateId: candidate.id,
          positionId: position.id,
          currentStageId: firstStage.id,
          status: "active",
          createdById: hr.id,
        })
        .returning({ id: applications.id });
      applicationId = application.id;
      const [
        firstApplicationStage,
        secondApplicationStage,
        thirdApplicationStage,
      ] = await db
        .insert(applicationStages)
        .values([
          {
            applicationId: application.id,
            positionStageId: firstStage.id,
            orderIndex: 0,
            status: "in_progress",
            enteredAt: now,
          },
          {
            applicationId: application.id,
            positionStageId: secondStage.id,
            orderIndex: 1,
            status: "passed",
            enteredAt: new Date(now.getTime() - 86_400_000),
            completedAt: now,
          },
          {
            applicationId: application.id,
            positionStageId: thirdStage.id,
            orderIndex: 2,
            status: "pending",
          },
        ])
        .returning({
          id: applicationStages.id,
          positionStageId: applicationStages.positionStageId,
        });
      const [firstCriterion, secondCriterion, thirdCriterion] = await db
        .insert(scorecardCriteria)
        .values([
          {
            positionStageId: firstStage.id,
            label: "Technical depth",
            weight: 2,
            orderIndex: 0,
          },
          {
            positionStageId: secondStage.id,
            label: "Leadership",
            weight: 1,
            orderIndex: 0,
          },
          {
            positionStageId: thirdStage.id,
            label: "Executive presence",
            weight: 1,
            orderIndex: 0,
          },
        ])
        .returning({
          id: scorecardCriteria.id,
          positionStageId: scorecardCriteria.positionStageId,
        });

      const [ownCurrent, peerCurrent, peerHidden, ownPrior] = await db
        .insert(scorecards)
        .values([
          {
            applicationId: application.id,
            applicationStageId: firstApplicationStage.id,
            authorId: interviewer.id,
            status: "submitted",
            recommendation: "strong_yes",
            overallScore: "4.50",
            strengths: "Own current-stage feedback",
            submittedAt: new Date(now.getTime() - 1_000),
          },
          {
            applicationId: application.id,
            applicationStageId: firstApplicationStage.id,
            authorId: peer.id,
            status: "submitted",
            recommendation: "yes",
            overallScore: "4.00",
            strengths: "Peer current-stage feedback",
            submittedAt: new Date(now.getTime() - 2_000),
          },
          {
            applicationId: application.id,
            applicationStageId: thirdApplicationStage.id,
            authorId: peer.id,
            status: "submitted",
            recommendation: "no",
            overallScore: "2.00",
            concerns: "Peer feedback at an unsubmitted stage",
            submittedAt: new Date(now.getTime() - 3_000),
          },
          {
            applicationId: application.id,
            applicationStageId: secondApplicationStage.id,
            authorId: interviewer.id,
            status: "submitted",
            recommendation: "yes",
            overallScore: "3.50",
            notes: "Own previous-stage feedback",
            submittedAt: new Date(now.getTime() - 4_000),
          },
        ])
        .returning({ id: scorecards.id });
      await db.insert(scorecards).values({
        applicationId: application.id,
        applicationStageId: firstApplicationStage.id,
        authorId: unassigned.id,
        status: "draft",
        strengths: "A draft is never readable",
      });
      await db.insert(scorecardRatings).values([
        {
          scorecardId: ownCurrent.id,
          criterionId: firstCriterion.id,
          rating: 5,
        },
        {
          scorecardId: peerCurrent.id,
          criterionId: firstCriterion.id,
          rating: 4,
        },
        {
          scorecardId: peerHidden.id,
          criterionId: thirdCriterion.id,
          rating: 2,
        },
        {
          scorecardId: ownPrior.id,
          criterionId: secondCriterion.id,
          rating: 4,
        },
      ]);

      const interviewerFeedback = await listScorecardsForApplication(
        application.id,
        interviewer,
      );
      assert.equal(interviewerFeedback.hiddenCount, 1);
      assert.equal(interviewerFeedback.total, 4);
      assert.deepEqual(
        interviewerFeedback.scorecards.map((scorecard) => scorecard.id),
        [ownCurrent.id, peerCurrent.id, ownPrior.id],
      );
      assert.deepEqual(interviewerFeedback.scorecards[0].ratings, [
        {
          criterionId: firstCriterion.id,
          label: "Technical depth",
          weight: 2,
          rating: 5,
          comment: null,
        },
      ]);

      for (const viewer of [hr, manager]) {
        const feedback = await listScorecardsForApplication(
          application.id,
          viewer,
        );
        assert.equal(feedback.hiddenCount, 0);
        assert.equal(feedback.total, 4);
        assert.deepEqual(
          feedback.scorecards.map((scorecard) => scorecard.id),
          [ownCurrent.id, peerCurrent.id, peerHidden.id, ownPrior.id],
        );
      }

      const deniedFeedback = await listScorecardsForApplication(
        application.id,
        unassigned,
      );
      assert.deepEqual(deniedFeedback, {
        scorecards: [],
        hiddenCount: 0,
        total: 0,
      });
    } finally {
      if (applicationId) {
        const applicationScorecards = db
          .select({ id: scorecards.id })
          .from(scorecards)
          .where(eq(scorecards.applicationId, applicationId));
        await db
          .delete(scorecardRatings)
          .where(inArray(scorecardRatings.scorecardId, applicationScorecards));
      }
      await db.delete(positions).where(eq(positions.id, position.id));
      if (candidateId) {
        await db.delete(candidates).where(eq(candidates.id, candidateId));
      }
      await removeUnassigned();
    }
  },
);

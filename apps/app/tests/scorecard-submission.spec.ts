import assert from "node:assert/strict";
import { test, expect, type Page } from "@playwright/test";
import { cleanupLeftovers, createStaffUser, db, TEST_PASSWORD, type Role } from "./fixtures";
import { and, eq, inArray } from "drizzle-orm";
import {
  activityLog,
  applications,
  applicationStages,
  candidates,
  positionStageInterviewers,
  positionStages,
  positions,
  scorecardCriteria,
  scorecardRatings,
  scorecardRevisions,
  scorecards,
  user,
} from "@/db/schema";


let positionId: string;
let candidateId: string;
let applicationId: string;
let applicationStageId: string;
let firstStageId: string;
let finalStageId: string;
let criterionId: string;
let hrEmail: string;
let interviewerEmail: string;
const testUserIds: string[] = [];


async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Signed in", { exact: true })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function completeFeedback(page: Page) {
  await page.getByRole("radio", { name: "Yes", exact: true }).click();
  await page.getByRole("radio", { name: "Decision quality: 4, Above" }).click();
  await page
    .getByLabel("Strengths")
    .fill("The candidate connected evidence to a clear decision.");
}

test.beforeAll(async () => {
  await cleanupLeftovers();
  const marker = crypto.randomUUID();
  hrEmail = `scorecard-e2e-hr-${marker}@docket.test`;
  interviewerEmail = `scorecard-e2e-interviewer-${marker}@docket.test`;
  const peerEmail = `scorecard-e2e-peer-${marker}@docket.test`;

  async function createTestUser(email: string, name: string, role: Role) {
    const id = await createStaffUser(email, name, role);
    testUserIds.push(id);
    return id;
  }

  const hrId = await createTestUser(hrEmail, "Scorecard E2E HR", "hr");
  const interviewerId = await createTestUser(
    interviewerEmail,
    "Scorecard E2E Interviewer",
    "interviewer",
  );
  const peerId = await createTestUser(
    peerEmail,
    "Scorecard E2E Peer",
    "interviewer",
  );

  const [position] = await db
    .insert(positions)
    .values({
      title: `Scorecard E2E ${marker}`,
      department: "Test",
      description: "Synthetic scorecard end-to-end position",
      status: "open",
      requireFeedbackToAdvance: true,
      createdById: hrId,
    })
    .returning({ id: positions.id });
  positionId = position.id;

  const stages = await db
    .insert(positionStages)
    .values([
      {
        positionId,
        name: "Evidence interview",
        orderIndex: 0,
        requiresScorecard: true,
        minScorecards: 1,
      },
      {
        positionId,
        name: "Final review",
        orderIndex: 1,
        requiresScorecard: false,
        minScorecards: 0,
      },
    ])
    .returning({
      id: positionStages.id,
      orderIndex: positionStages.orderIndex,
    });
  firstStageId = stages.find((stage) => stage.orderIndex === 0)!.id;
  finalStageId = stages.find((stage) => stage.orderIndex === 1)!.id;

  const [criterion] = await db
    .insert(scorecardCriteria)
    .values({
      positionStageId: firstStageId,
      label: "Decision quality",
      description:
        "Uses relevant evidence and reaches a defensible conclusion.",
      weight: 2,
      orderIndex: 0,
      isActive: true,
    })
    .returning({ id: scorecardCriteria.id });
  criterionId = criterion.id;

  await db.insert(positionStageInterviewers).values([
    { positionStageId: firstStageId, userId: interviewerId },
    { positionStageId: firstStageId, userId: peerId },
  ]);

  const [candidate] = await db
    .insert(candidates)
    .values({
      fullName: "Scorecard E2E Candidate",
      email: `scorecard-e2e-${marker}@docket.test`,
      currentTitle: "Synthetic candidate",
      createdById: hrId,
    })
    .returning({ id: candidates.id });
  candidateId = candidate.id;

  const [application] = await db
    .insert(applications)
    .values({
      candidateId,
      positionId,
      currentStageId: firstStageId,
      status: "active",
      createdById: hrId,
    })
    .returning({ id: applications.id });
  applicationId = application.id;

  const applicationStageRows = await db
    .insert(applicationStages)
    .values([
      {
        applicationId,
        positionStageId: firstStageId,
        orderIndex: 0,
        status: "in_progress",
        enteredAt: new Date(),
      },
      {
        applicationId,
        positionStageId: finalStageId,
        orderIndex: 1,
        status: "pending",
      },
    ])
    .returning({
      id: applicationStages.id,
      positionStageId: applicationStages.positionStageId,
    });
  applicationStageId = applicationStageRows.find(
    (stage) => stage.positionStageId === firstStageId,
  )!.id;
});

test.afterAll(async () => {
  if (applicationId) {
    // Ratings deliberately restrict criterion deletion to preserve history.
    // Remove the synthetic scorecard first so its cascades clear that history.
    await db
      .delete(scorecards)
      .where(eq(scorecards.applicationId, applicationId));
    await db
      .delete(activityLog)
      .where(eq(activityLog.applicationId, applicationId));
  }
  if (positionId) {
    await db.delete(positions).where(eq(positions.id, positionId));
  }
  if (candidateId) {
    await db.delete(candidates).where(eq(candidates.id, candidateId));
  }
  if (testUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, testUserIds));
  }
});

test("submit, revise with immutable history, clear the gate, and advance", async ({
  browser,
}) => {
  const interviewer = await browser.newContext();
  const page = await interviewer.newPage();
  await signIn(page, interviewerEmail);
  await page.goto(`/applications/${applicationId}/feedback`);
  await expect(
    page.getByRole("heading", { name: "Your feedback — Evidence interview" }),
  ).toBeVisible();

  const stalePage = await interviewer.newPage();
  await stalePage.goto(`/applications/${applicationId}/feedback`);
  await completeFeedback(stalePage);

  await completeFeedback(page);
  await page.getByRole("button", { name: "Submit feedback" }).click();
  await expect(
    page.getByText("Feedback submitted.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit feedback" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Edit your feedback", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Nothing changed.", { exact: true }),
  ).toBeVisible();

  const staleEditPage = await interviewer.newPage();
  await staleEditPage.goto(`/applications/${applicationId}/feedback`);
  await expect(
    staleEditPage.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();

  await page
    .getByLabel("Strengths")
    .fill("The candidate connected new evidence to a clear decision.");
  await page.getByRole("button", { name: "Save changes" }).click();
  // Save + revision + timeline refresh against the remote database.
  await expect(
    page.getByText("Feedback updated.", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });

  await staleEditPage
    .getByLabel("Strengths")
    .fill("A conflicting assessment from a stale browser session.");
  await staleEditPage.getByRole("button", { name: "Save changes" }).click();
  await expect(
    staleEditPage.getByText(
      "This feedback was changed by another session — reload and try again.",
      { exact: true },
    ),
  ).toBeVisible();

  // The first revision's toast must be gone before the second is asserted,
  // otherwise the assertion passes on the stale toast and the database read
  // below races the second save.
  await expect(page.getByText("Feedback updated.", { exact: true })).toBeHidden({
    timeout: 10_000,
  });
  await page
    .getByLabel("Notes")
    .fill("This second correction adds the final interview context.");
  await page.getByRole("button", { name: "Save changes" }).click();
  // Save + revision + timeline refresh against the remote database.
  await expect(
    page.getByText("Feedback updated.", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });

  await stalePage.getByRole("button", { name: "Submit feedback" }).click();
  await expect(
    stalePage.getByText("You already submitted feedback."),
  ).toBeVisible();

  const [saved] = await db
    .select({
      id: scorecards.id,
      status: scorecards.status,
      submittedAt: scorecards.submittedAt,
      overallScore: scorecards.overallScore,
      revisionCount: scorecards.revisionCount,
    })
    .from(scorecards)
    .where(
      and(
        eq(scorecards.applicationStageId, applicationStageId),
        eq(scorecards.status, "submitted"),
      ),
    );
  assert.ok(saved);
  assert.ok(saved.submittedAt);
  assert.equal(saved.overallScore, "4.00");
  assert.equal(saved.revisionCount, 3);

  const ratings = await db
    .select({
      criterionId: scorecardRatings.criterionId,
      rating: scorecardRatings.rating,
    })
    .from(scorecardRatings)
    .where(eq(scorecardRatings.scorecardId, saved.id));
  assert.deepEqual(ratings, [{ criterionId, rating: 4 }]);

  const revisions = await db
    .select({ revisionNumber: scorecardRevisions.revisionNumber })
    .from(scorecardRevisions)
    .where(eq(scorecardRevisions.scorecardId, saved.id));
  assert.deepEqual(
    revisions.map((revision) => revision.revisionNumber).sort(),
    [1, 2, 3],
  );

  const submissionEvents = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.applicationId, applicationId),
        eq(activityLog.action, "scorecard.submitted"),
      ),
    );
  assert.equal(submissionEvents.length, 1);

  const updateEvents = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.applicationId, applicationId),
        eq(activityLog.action, "scorecard.updated"),
      ),
    );
  assert.equal(updateEvents.length, 2);

  const gateScorecards = await db
    .select({ id: scorecards.id })
    .from(scorecards)
    .where(
      and(
        eq(scorecards.applicationStageId, applicationStageId),
        eq(scorecards.status, "submitted"),
      ),
    );
  assert.equal(gateScorecards.length, 1);

  await page.goto(`/applications/${applicationId}`);
  await page.getByRole("button", { name: "Edited ×2" }).click();
  await expect(page.getByRole("dialog")).toContainText("Edit history");
  await expect(page.getByRole("dialog")).toContainText("new evidence");

  await staleEditPage.close();
  await interviewer.close();

  const hr = await browser.newContext();
  const hrPage = await hr.newPage();
  await signIn(hrPage, hrEmail);
  // Decisions live on the application page; the profile only links there.
  await hrPage.goto(`/applications/${applicationId}`);
  await hrPage.getByRole("button", { name: "Advance", exact: true }).click();
  await expect(hrPage.getByLabel("Advance anyway — record a reason")).toHaveCount(0);
  await hrPage.getByRole("button", { name: /^Move to Final review/ }).click();
  await expect(hrPage.getByText(/moved to Final review\./)).toBeVisible();

  const [advanced] = await db
    .select({ currentStageId: applications.currentStageId })
    .from(applications)
    .where(eq(applications.id, applicationId));
  assert.equal(advanced.currentStageId, finalStageId);
  await hr.close();
});

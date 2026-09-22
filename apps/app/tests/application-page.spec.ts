import assert from "node:assert/strict";
import { test, expect, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  activityLog,
  applications,
  applicationStages,
  candidates,
  positionStageInterviewers,
  positionStages,
  positions,
  user,
} from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Playwright.");
const sql = postgres(databaseUrl, { prepare: false });
const db = drizzle(sql);

const testPassword = "ApplicationE2E!2026";
const testUserIds: string[] = [];
let positionId: string;
let candidateId: string;
let applicationId: string;
let hrEmail: string;
let managementEmail: string;
let interviewerEmail: string;

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Signed in", { exact: true })).toBeVisible();
}

test.beforeAll(async () => {
  const marker = crypto.randomUUID();
  hrEmail = `app-e2e-hr-${marker}@docket.test`;
  managementEmail = `app-e2e-mgmt-${marker}@docket.test`;
  interviewerEmail = `app-e2e-int-${marker}@docket.test`;

  async function createTestUser(email: string, name: string, role: "hr" | "management" | "interviewer") {
    const response = await fetch("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, name, password: testPassword }),
    });
    if (!response.ok) throw new Error(`Could not create ${role}: ${response.status}`);
    const [created] = await db
      .update(user)
      .set({ role, emailVerified: true, isActive: true })
      .where(eq(user.email, email))
      .returning({ id: user.id });
    assert.ok(created);
    testUserIds.push(created.id);
    return created.id;
  }

  const hrId = await createTestUser(hrEmail, "App E2E HR", "hr");
  await createTestUser(managementEmail, "App E2E Management", "management");
  const interviewerId = await createTestUser(interviewerEmail, "App E2E Interviewer", "interviewer");

  const [position] = await db
    .insert(positions)
    .values({
      title: `Application E2E ${marker}`,
      department: "Test",
      description: "Synthetic application page position",
      status: "open",
      requireFeedbackToAdvance: true,
      createdById: hrId,
    })
    .returning({ id: positions.id });
  positionId = position.id;
  const [first, second] = await db
    .insert(positionStages)
    .values([
      { positionId, name: "Screen", orderIndex: 0, requiresScorecard: true, minScorecards: 1 },
      { positionId, name: "Interview", orderIndex: 1, requiresScorecard: false, minScorecards: 0 },
    ])
    .returning({ id: positionStages.id });
  await db.insert(positionStageInterviewers).values({ positionStageId: first.id, userId: interviewerId });

  const [candidate] = await db
    .insert(candidates)
    .values({
      fullName: "App E2E Candidate",
      email: `app-e2e-cand-${marker}@example.com`,
      phone: "0711111111",
      createdById: null,
      source: "careers_site",
    })
    .returning({ id: candidates.id });
  candidateId = candidate.id;
  const [application] = await db
    .insert(applications)
    .values({
      candidateId,
      positionId,
      currentStageId: first.id,
      status: "active",
      salaryExpectation: "100k",
      createdById: null,
    })
    .returning({ id: applications.id });
  applicationId = application.id;
  await db.insert(applicationStages).values([
    { applicationId, positionStageId: first.id, orderIndex: 0, status: "in_progress", enteredAt: new Date() },
    { applicationId, positionStageId: second.id, orderIndex: 1, status: "pending" },
  ]);
});

test.afterAll(async () => {
  if (applicationId) await db.delete(activityLog).where(eq(activityLog.applicationId, applicationId));
  if (positionId) await db.delete(positions).where(eq(positions.id, positionId));
  if (candidateId) await db.delete(candidates).where(eq(candidates.id, candidateId));
  if (testUserIds.length > 0) await db.delete(user).where(inArray(user.id, testUserIds));
  await sql.end();
});

/**
 * One test, three sessions: a failed assertion restarts the worker and would
 * re-run beforeAll, and creating users again trips the auth rate limit.
 */
test("application page per role: HR, management, interviewer", async ({ browser }) => {
  // HR: everything, plus decision controls.
  const hr = await (await browser.newContext()).newPage();
  await signIn(hr, hrEmail);
  await hr.goto(`/applications/${applicationId}`);
  await expect(hr.getByRole("heading", { name: "App E2E Candidate" })).toBeVisible();
  await expect(hr.getByRole("list", { name: "Stages" })).toContainText("1Screen");
  await expect(hr.getByRole("list", { name: "Stages" })).toContainText("2Interview");
  await expect(hr.getByText("Advance blocked at “Screen”")).toBeVisible();
  await expect(hr.getByRole("button", { name: "Advance", exact: true })).toBeVisible();
  await expect(hr.getByRole("button", { name: "Reject", exact: true })).toBeVisible();
  await expect(hr.getByRole("button", { name: /Exceptions for/ })).toHaveCount(0);
  for (const tab of ["Feed", "Feedback", "Emails (0)", "Details"]) {
    await expect(hr.getByRole("link", { name: tab, exact: true })).toBeVisible();
  }
  await hr.getByRole("link", { name: "Details", exact: true }).click();
  await expect(hr).toHaveURL(/tab=details/);
  await expect(hr.getByText("100k")).toBeVisible();
  await expect(hr.getByText("No CV attached")).toBeVisible();
  await hr.getByRole("link", { name: "Emails (0)", exact: true }).click();
  await expect(hr.getByRole("button", { name: "Compose email" })).toBeVisible();
  await hr.context().close();

  // Management: view and exceptions only.
  const mgmt = await (await browser.newContext()).newPage();
  await signIn(mgmt, managementEmail);
  await mgmt.goto(`/applications/${applicationId}`);
  await expect(mgmt.getByRole("heading", { name: "App E2E Candidate" })).toBeVisible();
  await expect(mgmt.getByRole("button", { name: "Advance", exact: true })).toHaveCount(0);
  await expect(mgmt.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
  await expect(mgmt.getByRole("button", { name: "Hire", exact: true })).toHaveCount(0);
  await expect(mgmt.getByRole("button", { name: /Exceptions for/ })).toBeVisible();
  await mgmt.getByRole("link", { name: "Emails (0)", exact: true }).click();
  await expect(mgmt.getByRole("button", { name: "Compose email" })).toHaveCount(0);
  await mgmt.context().close();

  // Interviewer: Feedback by default, no Emails tab, no actions, salary hidden.
  const int = await (await browser.newContext()).newPage();
  await signIn(int, interviewerEmail);
  await int.goto(`/applications/${applicationId}`);
  await expect(int.getByRole("heading", { name: "App E2E Candidate" })).toBeVisible();
  await expect(int.getByRole("link", { name: "Feedback", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(int.getByRole("link", { name: /^Emails/ })).toHaveCount(0);
  await expect(int.getByRole("button", { name: "Advance", exact: true })).toHaveCount(0);
  await expect(int.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
  await expect(int.getByRole("button", { name: /Exceptions for/ })).toHaveCount(0);
  await int.getByRole("link", { name: "Details", exact: true }).click();
  await expect(int.getByText("Restricted")).toBeVisible();
  await expect(int.getByText("100k")).toHaveCount(0);
  // Asking for the staff-only tab directly falls back to a permitted one.
  await int.goto(`/applications/${applicationId}?tab=emails`);
  await expect(int.getByRole("button", { name: "Compose email" })).toHaveCount(0);
  await expect(int.getByRole("link", { name: "Feedback", exact: true })).toHaveAttribute("aria-current", "page");
  await int.context().close();
});

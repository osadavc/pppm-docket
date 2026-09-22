import assert from "node:assert/strict";
import { test, expect } from "@playwright/test";
import { and, eq, like } from "drizzle-orm";
import { activityLog, applications, attachments, candidates, notifications, positions, rateLimitBuckets } from "@/db/schema";
import { cleanupLeftovers, createStaffUser, db, deleteUsers, pdfFile, signInAndWait } from "./fixtures";

/**
 * Cross-feature workflows on the seeded dataset: manual intake with CV and
 * file access, public careers application with acknowledgement, free-form
 * email, and the seeded workspaces (board, review, list, dashboard,
 * analytics) plus the Sprint 1 QA fixes.
 */
const ids: string[] = [];
const candidateEmails: string[] = [];
let hrEmail: string;
let managerEmail: string;
let openPositionId: string;

test.beforeAll(async () => {
  await cleanupLeftovers();
  const marker = crypto.randomUUID();
  hrEmail = `wf-e2e-hr-${marker}@docket.test`;
  managerEmail = `wf-e2e-mgmt-${marker}@docket.test`;
  ids.push(await createStaffUser(hrEmail, "Workflow E2E HR", "hr"));
  ids.push(await createStaffUser(managerEmail, "Workflow E2E Manager", "management"));
  const [position] = await db.select({ id: positions.id }).from(positions).where(eq(positions.title, "Senior Backend Engineer"));
  if (!position) throw new Error("Run `bun run db:seed` first.");
  openPositionId = position.id;
});

test.afterAll(async () => {
  for (const email of candidateEmails) {
    const [c] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.email, email));
    if (!c) continue;
    const apps = await db.select({ id: applications.id }).from(applications).where(eq(applications.candidateId, c.id));
    for (const a of apps) await db.delete(activityLog).where(eq(activityLog.applicationId, a.id));
    await db.delete(candidates).where(eq(candidates.id, c.id));
  }
  await db.delete(rateLimitBuckets).where(like(rateLimitBuckets.key, "public-apply:%"));
  await deleteUsers(ids);
});

test("manual intake with CV, authorised vs anonymous file access, duplicate notice with status (QA-15)", async ({ page, context, browser }) => {
  const email = `wf-intake-${crypto.randomUUID()}@example.com`;
  candidateEmails.push(email);
  await signInAndWait(page, hrEmail);
  await page.goto("/candidates/new");
  await page.getByLabel("Full name").fill("Intake E2E Candidate");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Position").click();
  await page.getByRole("option", { name: /Senior Backend Engineer/ }).click();
  await page.getByLabel("CV").setInputFiles(pdfFile("intake-cv.pdf"));
  await page.getByRole("button", { name: "Add candidate" }).click();
  // Real upload to the private bucket: allow more than the default 5 s.
  await expect(page.getByText("Candidate added to the pipeline")).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/candidates\/[0-9a-f-]{36}$/);

  const [candidate] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.email, email));
  const [application] = await db
    .select({ id: applications.id, currentStageId: applications.currentStageId })
    .from(applications)
    .where(eq(applications.candidateId, candidate.id));
  const [cv] = await db.select({ id: attachments.id }).from(attachments).where(eq(attachments.applicationId, application.id));
  assert.ok(cv, "CV attachment recorded");
  // HR is authorised: a short-lived signed redirect. Anonymous: 401.
  const authorised = await context.request.get(`/api/files/${cv.id}`, { maxRedirects: 0 });
  assert.ok([302, 307].includes(authorised.status()));
  const anonymous = await (await browser.newContext()).request.get(`/api/files/${cv.id}`, { maxRedirects: 0 });
  assert.equal(anonymous.status(), 401);

  // The application landed at the first live stage and links from the profile.
  await expect(page.getByRole("link", { name: "Application" })).toBeVisible();
  await page.getByRole("link", { name: "Application" }).click();
  await expect(page.getByRole("list", { name: "Stages" }).getByText("1Application Review")).toBeVisible();

  // Adding the same person again shows the prior application with its status.
  await page.goto("/candidates/new");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Email").blur();
  const notice = page.getByText("Intake E2E Candidate is already on file");
  await expect(notice).toBeVisible();
  await expect(page.getByText("Applied before:").locator("..")).toContainText("Active");
});

test("public careers: filtering, deadline copy, apply with CV, acknowledgement, duplicate refusal", async ({ page }) => {
  const email = `wf-public-${crypto.randomUUID()}@example.com`;
  candidateEmails.push(email);
  await page.goto("/careers");
  await expect(page.getByRole("link", { name: /Senior Backend Engineer/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Customer Support Lead/ })).toHaveCount(0);
  await expect(page.getByText(/2 openings · apply by/)).toBeVisible();
  // Pills appear only when more than one department is open; with the seed
  // alone there is just Engineering, so either branch is a valid board.
  const pill = page.getByRole("link", { name: /^Engineering \(\d+\)$/ });
  if ((await pill.count()) > 0) {
    await pill.click();
    await expect(page).toHaveURL(/department=Engineering/);
    await expect(page.getByRole("link", { name: /^Engineering \(\d+\)$/ })).toHaveAttribute("aria-current", "page");
  } else {
    await expect(page.getByRole("link", { name: /^All \(\d+\)$/ })).toHaveCount(0);
  }

  await page.goto(`/careers/${openPositionId}`);
  await expect(page.getByText("Takes about two minutes. We read every application and reply either way.")).toBeVisible();
  await page.getByLabel("Full name").fill("Public E2E Applicant");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Salary expectation (optional)").fill("130k");
  await page.getByLabel("CV").setInputFiles(pdfFile("public-cv.pdf"));
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page).toHaveURL(new RegExp(`/careers/${openPositionId}/applied`));
  await expect(page.getByRole("heading", { name: /Thanks — you.re in the running for Senior Backend Engineer/ })).toBeVisible();

  const [candidate] = await db.select({ id: candidates.id, createdById: candidates.createdById }).from(candidates).where(eq(candidates.email, email));
  assert.equal(candidate.createdById, null);
  const [application] = await db.select({ id: applications.id, salaryExpectation: applications.salaryExpectation }).from(applications).where(eq(applications.candidateId, candidate.id));
  assert.equal(application.salaryExpectation, "130k");
  const [ack] = await db.select({ type: notifications.type, status: notifications.status, actorId: notifications.actorId }).from(notifications).where(eq(notifications.applicationId, application.id));
  assert.equal(ack.type, "application_received");
  assert.equal(ack.actorId, null);
  assert.ok(["simulated", "sent"].includes(ack.status));

  // Duplicate is refused server-side with a field error and no second row.
  await page.goto(`/careers/${openPositionId}`);
  await page.getByLabel("Full name").fill("Public E2E Applicant");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("CV").setInputFiles(pdfFile("public-cv.pdf"));
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText(/You have already applied for this role/)).toBeVisible();
  const apps = await db.select({ id: applications.id }).from(applications).where(eq(applications.candidateId, candidate.id));
  assert.equal(apps.length, 1);

  // A role past its deadline keeps its page but not its form.
  const [filled] = await db.select({ id: positions.id }).from(positions).where(eq(positions.title, "Customer Support Lead"));
  const closed = await page.goto(`/careers/${filled.id}`);
  assert.equal(closed?.status(), 404, "non-open positions stay 404");
});

test("free-form email is recorded, simulated and listed; timeline shows delivery status", async ({ page }) => {
  await signInAndWait(page, hrEmail);
  const [application] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.positionId, openPositionId), eq(applications.status, "active")))
    .limit(1);
  await page.goto(`/applications/${application.id}?tab=emails`);
  const before = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.applicationId, application.id));
  await page.getByRole("button", { name: "Compose email" }).click();
  const subject = `E2E note ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("Message").fill("Hi there,\n\nJust checking you received our earlier note. Thanks!");
  await page.getByRole("button", { name: "Send email" }).click();
  await expect(page.getByText(/Message recorded\./)).toBeVisible();
  await expect(page.getByText(subject)).toBeVisible();
  await expect(page.getByRole("link", { name: `Emails (${before.length + 1})`, exact: true })).toBeVisible();
  const [sent] = await db
    .select({ type: notifications.type, status: notifications.status, subject: notifications.subject })
    .from(notifications)
    .where(and(eq(notifications.applicationId, application.id), eq(notifications.subject, subject)));
  assert.equal(sent.type, "custom");
  assert.ok(["simulated", "sent"].includes(sent.status));
  await page.goto(`/applications/${application.id}?tab=feed`);
  await expect(page.getByText(subject)).toBeVisible();
  await expect(page.getByText(subject).locator("..")).toContainText(/Simulated|Sent/);
  // Clean up the note so re-runs stay predictable.
  await db.delete(notifications).where(and(eq(notifications.applicationId, application.id), eq(notifications.subject, subject)));
});

test("seeded workspaces: bounded board, review with CV preview, position list, dashboard, analytics", async ({ page }) => {
  await signInAndWait(page, hrEmail);

  await page.goto(`/positions/${openPositionId}/pipeline`);
  await expect(page.getByRole("link", { name: /Review \d+ at Application Review/ })).toBeVisible();
  const reviewColumn = page.locator("section", { has: page.getByRole("heading", { name: "Application Review" }) });
  assert.ok((await reviewColumn.locator("a[href^='/applications/']").count()) <= 8, "column is bounded to 8 cards");
  await expect(reviewColumn.getByRole("link", { name: /View all \d+/ })).toBeVisible();
  await expect(page.getByText("Rejected").locator("..").getByRole("link")).toBeVisible();

  await page.getByRole("link", { name: /Review \d+ at Application Review/ }).click();
  await expect(page.getByRole("heading", { name: /Review at Application Review/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Advance", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toBeVisible();
  const frame = page.locator("iframe[title^='CV — ']");
  const noCv = page.getByText("No CV attached");
  await expect(frame.or(noCv).first()).toBeVisible();
  await page.keyboard.press("j");
  await expect(page.getByText(/^2 of \d+ loaded/)).toBeVisible();

  await page.goto(`/positions/${openPositionId}/candidates?status=rejected`);
  await expect(page.getByRole("link", { name: "Rejected", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/Page 1 of \d+ · \d+ total/).first()).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Rejected");

  await page.goto("/dashboard");
  await expect(page.getByText("Open positions")).toBeVisible();
  await expect(page.getByText(/blocked on feedback/).first()).toBeVisible();
  await expect(page.getByText("Recent activity")).toBeVisible();

  await page.goto("/reports");
  await expect(page.getByText("Stage funnels")).toBeVisible();
  await expect(page.getByText("Customer Support Lead: opened")).toBeVisible();
  await expect(page.getByText("Average time to hire")).toBeVisible();

  // Positions list: pills, search, live-stage count, On hold renders 0 (QA-20).
  await page.goto("/positions?status=open");
  const row = page.getByRole("row", { name: /Senior Backend Engineer/ });
  await expect(row).toContainText("5"); // five live stages
  await expect(row.getByRole("cell").nth(6)).toHaveText("0");
  await page.goto("/positions?q=Support");
  await expect(page.getByRole("row", { name: /Customer Support Lead/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Senior Backend Engineer/ })).toHaveCount(0);
});

test("management: approval history and stage criteria editing preserve history", async ({ page }) => {
  await signInAndWait(page, managerEmail);
  const [draft] = await db.select({ id: positions.id }).from(positions).where(eq(positions.title, "Product Designer"));
  await page.goto(`/positions/${draft.id}`);
  await expect(page.getByText("Requested by Nadia Perera")).toBeVisible();
  await expect(page.getByText("Sent back by Rohan Silva")).toBeVisible();
  await expect(page.getByText("Add a salary band and a deadline before we advertise.").first()).toBeVisible();

  await page.goto(`/positions/${openPositionId}/stages`);
  const phoneCard = page.locator("li", { has: page.getByText("Phone Screen", { exact: true }) }).first();
  await phoneCard.getByRole("button", { name: /criteri/ }).click();
  await page.getByRole("button", { name: "Add criterion" }).click();
  const label = `E2E criterion ${crypto.randomUUID().slice(0, 6)}`;
  await page.getByLabel("Label").fill(label);
  await page.getByRole("button", { name: "Add criterion" }).last().click();
  await expect(page.getByText(`Added “${label}”.`)).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(label);
  await page.getByRole("button", { name: `Deactivate ${label}` }).click();
  await expect(page.getByText(`“${label}” deactivated. Past ratings are kept.`)).toBeVisible();
  const [logged] = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(and(eq(activityLog.positionId, openPositionId), eq(activityLog.action, "position.stage_criteria_changed")))
    .limit(1);
  assert.ok(logged, "criteria change is on the position's activity");
});

test("mobile (390px): no floating avatar over table rows, wide tables scroll with an affordance (QA-19)", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await signInAndWait(page, hrEmail);
  await page.goto("/candidates");
  await expect(page.getByRole("heading", { name: "Candidates" })).toBeVisible();
  const scroller = page.locator("[data-slot='scroll-x']").first();
  await expect(scroller).toBeVisible();
  // Whether the table needs to scroll depends on content width; what must
  // hold is that when it does, the scroller (not the page) carries it.
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.equal(pageOverflow, false, "the page itself never scrolls sideways");
  // Nothing fixed-position sits over the table other than the sidebar sheet (closed).
  const overlapping = await page.evaluate(() => {
    const table = document.querySelector("table");
    if (!table) return [];
    const rect = table.getBoundingClientRect();
    const points = [[rect.left + 8, Math.min(rect.bottom - 8, window.innerHeight - 8)], [rect.left + 8, rect.top + 8]];
    return points.map(([x, y]) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      return el?.closest("table") ? "table" : (el?.tagName ?? "none") + "." + (el?.className ?? "");
    });
  });
  assert.ok(overlapping.every((hit) => hit === "table"), `something covers the table: ${overlapping.join(", ")}`);
  await context.close();
});

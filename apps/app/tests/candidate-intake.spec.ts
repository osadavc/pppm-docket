import assert from "node:assert/strict";
import { test, expect as baseExpect } from "@playwright/test";
import { eq, like } from "drizzle-orm";
import { activityLog, applications, candidates, notifications, positions, rateLimitBuckets } from "@/db/schema";
import { cleanupLeftovers, createStaffUser, db, deleteUsers, pdfFile, signInAndWait } from "./fixtures";

/**
 * The public application form's refusals (bad fields, wrong file type, bot
 * traffic) and what happens when HR rejects the resulting application.
 * Candidate emails use the app-e2e-cand- prefix cleanupLeftovers sweeps.
 */
// Every step waits on a server action against the remote database.
const expect = baseExpect.configure({ timeout: 15_000 });
const ids: string[] = [];
const candidateEmails: string[] = [];
let hrEmail: string;
let openPositionId: string;

test.beforeAll(async () => {
  await cleanupLeftovers();
  hrEmail = `intake-e2e-hr-${crypto.randomUUID()}@docket.test`;
  ids.push(await createStaffUser(hrEmail, "Intake E2E HR", "hr"));
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

function newCandidateEmail() {
  const email = `app-e2e-cand-${crypto.randomUUID()}@example.com`;
  candidateEmails.push(email);
  return email;
}

async function candidateByEmail(email: string) {
  const [row] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.email, email));
  return row;
}

test("public form: field errors and a non-CV file are refused server-side; nothing is stored", async ({ page }) => {
  const email = newCandidateEmail();
  await page.goto(`/careers/${openPositionId}`);

  // The form is noValidate, so this reaches the server exactly as a script would.
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("Check the highlighted fields.")).toBeVisible();
  await expect(page.getByText("Enter your full name")).toBeVisible();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();

  await page.getByLabel("Full name").fill("Intake E2E Applicant");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("CV").setInputFiles({ name: "cv.txt", mimeType: "text/plain", buffer: Buffer.from("I am a CV, honest") });
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("The CV must be a PDF or Word document (.pdf, .doc, .docx).").first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/careers/${openPositionId}$`));

  assert.equal(await candidateByEmail(email), undefined, "no candidate row");
});

test("honeypot: a bot that fills the hidden field sees success but nothing is recorded", async ({ page }) => {
  const email = newCandidateEmail();
  await page.goto(`/careers/${openPositionId}`);
  await page.getByLabel("Full name").fill("Totally Real Person");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("CV").setInputFiles(pdfFile());
  // Off-screen and aria-hidden: a person never sees it, a naive bot fills it.
  await page.locator("#website").fill("https://spam.example", { force: true });
  await page.getByRole("button", { name: "Submit application" }).click();

  await expect(page).toHaveURL(new RegExp(`/careers/${openPositionId}/applied$`));
  assert.equal(await candidateByEmail(email), undefined, "decoy success stores no candidate");
  const acks = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.recipientEmail, email));
  assert.equal(acks.length, 0, "and sends no acknowledgement");
});

test("HR rejection needs a reason (and a real note for “Other”), then records it and emails the candidate", async ({ page, browser }) => {
  const email = newCandidateEmail();
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/careers/${openPositionId}`);
  await anon.getByLabel("Full name").fill("Reject E2E Applicant");
  await anon.getByLabel("Email").fill(email);
  await anon.getByLabel("CV").setInputFiles(pdfFile());
  await anon.getByRole("button", { name: "Submit application" }).click();
  await expect(anon).toHaveURL(/\/applied$/);
  await anon.context().close();

  const candidate = await candidateByEmail(email);
  const [application] = await db.select({ id: applications.id }).from(applications).where(eq(applications.candidateId, candidate.id));

  await signInAndWait(page, hrEmail);
  await page.goto(`/applications/${application.id}`);
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Reject Reject E2E Applicant" });
  const confirm = dialog.getByRole("button", { name: "Reject & send email" });
  await expect(confirm).toBeDisabled(); // no reason chosen yet

  await dialog.getByLabel("Other").check();
  await expect(dialog.getByText("Internal note (required)")).toBeVisible();
  await dialog.getByLabel(/Internal note/).fill("Too short");
  await expect(confirm).toBeDisabled();
  const note = "Withdrew verbally on the phone screen call.";
  await dialog.getByLabel(/Internal note/).fill(note);
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByText("Reject E2E Applicant rejected.")).toBeVisible();
  // The toast lands first; the page then refreshes into its rejected state.
  const banner = page.getByRole("alert").filter({ hasText: "Rejected — Other" });
  await expect(banner).toContainText(note);
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);

  const [row] = await db
    .select({ status: applications.status, reason: applications.rejectionReason, detail: applications.decisionReason, at: applications.decisionAt })
    .from(applications)
    .where(eq(applications.id, application.id));
  assert.deepEqual([row.status, row.reason, row.detail], ["rejected", "other", note]);
  assert.ok(row.at, "decisionAt stamped");
  const sent = await db
    .select({ type: notifications.type, status: notifications.status })
    .from(notifications)
    .where(eq(notifications.applicationId, application.id));
  const rejection = sent.find((n) => n.type === "rejection");
  assert.ok(rejection, "rejection email recorded");
  assert.ok(["simulated", "sent"].includes(rejection.status));
});

import assert from "node:assert/strict";
import { test, expect as baseExpect } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { activityLog, positions } from "@/db/schema";
import { cleanupLeftovers, createStaffUser, db, deleteUsers, signInAndWait } from "./fixtures";

/**
 * A position's life before it is advertised: draft validation, the submit
 * gate, management sending it back with a note, and approval publishing it.
 * Titles carry " E2E " so cleanupLeftovers can sweep an aborted run.
 */
// Every step waits on a server action against the remote database.
const expect = baseExpect.configure({ timeout: 15_000 });
const ids: string[] = [];
const createdTitles: string[] = [];
let hrEmail: string;
let managerEmail: string;

test.beforeAll(async () => {
  await cleanupLeftovers();
  const marker = crypto.randomUUID();
  hrEmail = `pos-e2e-hr-${marker}@docket.test`;
  managerEmail = `pos-e2e-mgmt-${marker}@docket.test`;
  ids.push(await createStaffUser(hrEmail, "Position E2E HR", "hr"));
  ids.push(await createStaffUser(managerEmail, "Position E2E Manager", "management"));
});

test.afterAll(async () => {
  if (createdTitles.length > 0) {
    const rows = await db.select({ id: positions.id }).from(positions).where(inArray(positions.title, createdTitles));
    for (const p of rows) {
      await db.delete(activityLog).where(eq(activityLog.positionId, p.id));
      await db.delete(positions).where(eq(positions.id, p.id));
    }
  }
  await deleteUsers(ids);
});

function isoDate(daysFromNow: number) {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

async function positionByTitle(title: string) {
  const [row] = await db
    .select({ id: positions.id, status: positions.status, reviewNote: positions.reviewNote, openedAt: positions.openedAt })
    .from(positions)
    .where(eq(positions.title, title));
  return row;
}

test("draft form rejects bad input without saving; an empty draft cannot be submitted", async ({ page }) => {
  const title = `QA E2E Draft ${crypto.randomUUID().slice(0, 6)}`;
  createdTitles.push(title);
  await signInAndWait(page, hrEmail);
  await page.goto("/positions/new");

  await page.getByLabel("Job title").fill("QA");
  await page.getByLabel("Application deadline").fill(isoDate(-3));
  await page.getByLabel("Salary from").fill("200000");
  await page.getByLabel("Salary to").fill("150000");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Title must be at least 3 characters")).toBeVisible();
  await expect(page.getByText("Department is required")).toBeVisible();
  await expect(page.getByText("The deadline must be in the future")).toBeVisible();
  await expect(page.getByText("Maximum salary must not be below the minimum")).toBeVisible();
  await expect(page).toHaveURL(/\/positions\/new$/);

  // Fix only what a draft needs: title and department.
  await page.getByLabel("Job title").fill(title);
  await page.getByLabel("Department").fill("Quality");
  await page.getByLabel("Application deadline").fill("");
  await page.getByLabel("Salary to").fill("");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Draft position created")).toBeVisible();
  await expect(page).toHaveURL(/\/positions\/[0-9a-f-]{36}$/);
  assert.equal((await positionByTitle(title))?.status, "draft");

  await page.getByRole("button", { name: "Submit for approval" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    page.getByText("Add a job description and an application deadline before submitting this position for approval."),
  ).toBeVisible();
  assert.equal((await positionByTitle(title))?.status, "draft", "still a draft");
});

test("submit → sent back with a note → resubmit → approved and on the careers board", async ({ browser }) => {
  const title = `Platform E2E Engineer ${crypto.randomUUID().slice(0, 6)}`;
  createdTitles.push(title);
  const note = "Please add the salary band before we advertise this.";

  const hr = await (await browser.newContext()).newPage();
  await signInAndWait(hr, hrEmail);
  await hr.goto("/positions/new");
  await hr.getByLabel("Job title").fill(title);
  await hr.getByLabel("Department").fill("Engineering");
  await hr.getByLabel("Application deadline").fill(isoDate(30));
  await hr.getByLabel("Job description").fill("Own the deployment platform and the paved road for product teams.");
  await hr.getByRole("button", { name: "Create draft" }).click();
  await expect(hr).toHaveURL(/\/positions\/[0-9a-f-]{36}$/);
  const positionUrl = hr.url();
  const submit = async () => {
    await hr.getByRole("button", { name: "Submit for approval" }).click();
    await hr.getByRole("dialog").getByRole("button", { name: "Submit", exact: true }).click();
    await expect(hr.getByText("Sent for approval")).toBeVisible();
  };
  await submit();
  assert.equal((await positionByTitle(title))?.status, "pending_approval");

  // Not advertised while pending.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/careers");
  await expect(anon.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);

  const manager = await (await browser.newContext()).newPage();
  await signInAndWait(manager, managerEmail);
  await manager.goto("/positions/approvals");
  await expect(manager.getByText(title)).toBeVisible();
  await manager.goto(positionUrl);
  await manager.getByRole("button", { name: "Reject" }).click();
  const dialog = manager.getByRole("dialog");
  const sendBack = dialog.getByRole("button", { name: "Reject and return" });
  await dialog.getByLabel("What needs to change").fill("Too short");
  await expect(sendBack).toBeDisabled(); // a note under ten characters tells HR nothing
  await dialog.getByLabel("What needs to change").fill(note);
  await sendBack.click();
  await expect(manager.getByText("Returned to HR with your note")).toBeVisible();
  const sentBack = await positionByTitle(title);
  assert.equal(sentBack?.status, "draft");
  assert.equal(sentBack?.reviewNote, note);

  await hr.reload();
  await expect(hr.getByText("Sent back by Position E2E Manager")).toBeVisible();
  await expect(hr.getByText(note).first()).toBeVisible();
  await submit();

  await manager.reload();
  await manager.getByRole("button", { name: "Approve" }).click();
  await manager.getByRole("dialog").getByRole("button", { name: "Approve and open" }).click();
  await expect(manager.getByText("Approved — the position is now on the careers board")).toBeVisible();
  const opened = await positionByTitle(title);
  assert.equal(opened?.status, "open");
  assert.ok(opened?.openedAt, "openedAt stamped on approval");

  await anon.goto("/careers");
  await anon.getByRole("link", { name: new RegExp(title) }).click();
  await expect(anon).toHaveURL(new RegExp(`/careers/${opened!.id}$`));
  await expect(anon.getByRole("button", { name: "Submit application" })).toBeVisible();

  const actions = await db
    .select({ action: activityLog.action })
    .from(activityLog)
    .where(and(eq(activityLog.entityType, "position"), eq(activityLog.positionId, opened!.id)));
  const count = (a: string) => actions.filter((r) => r.action === a).length;
  assert.equal(count("position.submitted_for_approval"), 2);
  assert.equal(count("position.rejected"), 1);
  assert.equal(count("position.approved"), 1);

  for (const p of [hr, anon, manager]) await p.context().close();
});

import assert from "node:assert/strict";
import { test, expect, type Page } from "@playwright/test";
import { cleanupLeftovers, createStaffUser, db, TEST_PASSWORD, type Role } from "./fixtures";
import { eq, inArray } from "drizzle-orm";
import { activityLog, attachments, session, user } from "@/db/schema";



const testUserIds: string[] = [];
let managerEmail: string;
let leaverEmail: string;
let leaverId: string;

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.beforeAll(async () => {
  await cleanupLeftovers();
  const marker = crypto.randomUUID();
  managerEmail = `deact-e2e-mgmt-${marker}@docket.test`;
  leaverEmail = `deact-e2e-leaver-${marker}@docket.test`;

  async function createTestUser(email: string, name: string, role: Role) {
    const id = await createStaffUser(email, name, role);
    testUserIds.push(id);
    return id;
  }
  await createTestUser(managerEmail, "Deact E2E Manager", "management");
  leaverId = await createTestUser(leaverEmail, "Deact E2E Leaver", "interviewer");
});

test.afterAll(async () => {
  if (testUserIds.length > 0) {
    await db.delete(activityLog).where(inArray(activityLog.entityId, testUserIds));
    await db.delete(user).where(inArray(user.id, testUserIds));
  }
});

test("deactivation revokes live sessions, refuses sign-in and file access; reactivation restores", async ({ browser }) => {
  const [cv] = await db.select({ id: attachments.id }).from(attachments).limit(1);

  // The leaver is signed in and working.
  const leaver = await (await browser.newContext()).newPage();
  await signIn(leaver, leaverEmail);
  await expect(leaver.getByText("Signed in", { exact: true })).toBeVisible();
  await leaver.goto("/dashboard");
  await expect(leaver).toHaveURL(/\/dashboard$/);
  if (cv) {
    const before = await leaver.request.get(`/api/files/${cv.id}`, { maxRedirects: 0 });
    assert.notEqual(before.status(), 401, "signed-in user is not refused outright");
  }

  // Management deactivates them from the Users table.
  const manager = await (await browser.newContext()).newPage();
  await signIn(manager, managerEmail);
  await expect(manager.getByText("Signed in", { exact: true })).toBeVisible();
  await manager.goto("/admin/users");
  const row = manager.getByRole("row", { name: new RegExp(leaverEmail) });
  await expect(row).toContainText("Active");
  await row.getByRole("button", { name: "Actions for Deact E2E Leaver" }).click();
  await manager.getByRole("menuitem", { name: "Deactivate account" }).click();
  await manager.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(manager.getByText(/is deactivated and signed out everywhere/)).toBeVisible();
  await expect(manager.getByRole("row", { name: new RegExp(leaverEmail) })).toContainText("Deactivated");

  const sessions = await db.select({ id: session.id }).from(session).where(eq(session.userId, leaverId));
  assert.equal(sessions.length, 0, "every session row deleted");

  // The live session is dead: protected page bounces, file route is 401.
  await leaver.goto("/queue");
  await expect(leaver).toHaveURL(/\/sign-in/);
  if (cv) {
    const after = await leaver.request.get(`/api/files/${cv.id}`, { maxRedirects: 0 });
    assert.equal(after.status(), 401);
  }

  // Sign-in is refused with a stable message, no redirect loop.
  await signIn(leaver, leaverEmail);
  await expect(leaver.getByText("This account has been deactivated. Contact your administrator.")).toBeVisible();
  await expect(leaver).toHaveURL(/\/sign-in/);
  const [stillNone] = await db.select({ id: session.id }).from(session).where(eq(session.userId, leaverId));
  assert.equal(stillNone, undefined, "no session was minted for the refused sign-in");

  // Reactivate; sign-in works again.
  await manager.goto("/admin/users");
  await manager.getByRole("row", { name: new RegExp(leaverEmail) }).getByRole("button", { name: "Actions for Deact E2E Leaver" }).click();
  await manager.getByRole("menuitem", { name: "Reactivate" }).click();
  await manager.getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(manager.getByText(/is active again/)).toBeVisible();

  await signIn(leaver, leaverEmail);
  await expect(leaver.getByText("Signed in", { exact: true })).toBeVisible();

  // Management cannot deactivate themselves: the menu item is disabled.
  await manager.goto("/admin/users");
  await manager.getByRole("row", { name: new RegExp(managerEmail) }).getByRole("button", { name: "Actions for Deact E2E Manager" }).click();
  await expect(manager.getByRole("menuitem", { name: "Deactivate account" })).toHaveAttribute("aria-disabled", "true");

  await leaver.context().close();
  await manager.context().close();
});

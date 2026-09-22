import assert from "node:assert/strict";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { user } from "@/db/schema";
import { cleanupLeftovers, BASE_URL, createStaffUser, db, deleteUsers, signIn, signInAndWait, TEST_PASSWORD, userIdByEmail } from "./fixtures";

const ids: string[] = [];
let managerEmail: string;
let staffEmail: string;
let provisionedEmail: string;

test.beforeAll(async () => {
  await cleanupLeftovers();
  const marker = crypto.randomUUID();
  managerEmail = `auth-e2e-mgmt-${marker}@docket.test`;
  staffEmail = `auth-e2e-hr-${marker}@docket.test`;
  provisionedEmail = `auth-e2e-new-${marker}@docket.test`;
  ids.push(await createStaffUser(managerEmail, "Auth E2E Manager", "management"));
  ids.push(await createStaffUser(staffEmail, "Auth E2E HR", "hr"));
});

test.afterAll(async () => {
  const created = await userIdByEmail(provisionedEmail);
  if (created) ids.push(created);
  await deleteUsers(ids);
});

test("public sign-up is closed: API refuses, route is gone, copy says so", async ({ request, page }) => {
  const email = `auth-e2e-signup-${crypto.randomUUID()}@docket.test`;
  const response = await request.post(`${BASE_URL}/api/auth/sign-up/email`, {
    headers: { origin: BASE_URL },
    data: { email, name: "Nobody", password: TEST_PASSWORD },
  });
  assert.ok(response.status() >= 400, `sign-up must be refused, got ${response.status()}`);
  assert.equal(await userIdByEmail(email), undefined, "no user row was created");

  // Not a public path any more: the proxy sends it to sign-in like any
  // other unknown internal URL.
  await page.goto("/sign-up");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.goto("/sign-in");
  await expect(page.getByText("Accounts are created by your hiring manager — there is no public sign-up.")).toBeVisible();
  await expect(page.getByRole("link", { name: /create one/i })).toHaveCount(0);
});

test("login, session persistence, logout and invalid credentials", async ({ page }) => {
  // Signed-out visitors are sent to sign-in with their destination preserved.
  await page.goto("/candidates");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fcandidates/);

  await signIn(page, staffEmail, "wrong-password");
  await expect(page.getByText("Invalid email or password")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);

  await signInAndWait(page, staffEmail);
  await page.goto("/candidates");
  await expect(page.getByRole("heading", { name: "Candidates" })).toBeVisible();
  // The session survives a reload and a fresh navigation.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Candidates" })).toBeVisible();

  await page.getByRole("button", { name: /Auth E2E HR/ }).click();
  await page.getByRole("menuitem", { name: /Sign out/ }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/candidates");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("management provisions an account through createStaffAccount; the new user signs in", async ({ browser }) => {
  const manager = await (await browser.newContext()).newPage();
  await signInAndWait(manager, managerEmail);
  await manager.goto("/admin/users");
  await manager.getByRole("button", { name: "New account" }).click();
  const dialog = manager.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("Auth E2E Provisioned");
  await dialog.getByLabel("Work email").fill(provisionedEmail);
  await dialog.getByLabel("Temporary password").fill(TEST_PASSWORD);
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(manager.getByRole("row", { name: /Auth E2E Provisioned/ })).toBeVisible();
  const [row] = await db.select({ role: user.role, isActive: user.isActive }).from(user).where(eq(user.email, provisionedEmail));
  assert.ok(row);
  assert.equal(row.isActive, true);
  await manager.context().close();

  const fresh = await (await browser.newContext()).newPage();
  await signInAndWait(fresh, provisionedEmail);
  await fresh.goto("/dashboard");
  await expect(fresh).toHaveURL(/\/dashboard$/);
  await fresh.context().close();
});

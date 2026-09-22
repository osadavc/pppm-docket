import assert from "node:assert/strict";
import { test, expect, type Page } from "@playwright/test";
import { BASE_URL, cleanupLeftovers, createStaffUser, deleteUsers, signInAndWait, TEST_PASSWORD } from "./fixtures";

/**
 * Where sign-in sends people afterwards, and which staff pages each role may
 * open. `next` comes straight from the query string, so it must never be able
 * to send a freshly signed-in user to another site.
 */
const ids: string[] = [];
let hrEmail: string;
let interviewerEmail: string;
let managerEmail: string;
const LOCAL_HOST = new URL(BASE_URL).host;

test.beforeAll(async () => {
  await cleanupLeftovers();
  const marker = crypto.randomUUID();
  hrEmail = `access-e2e-hr-${marker}@docket.test`;
  interviewerEmail = `access-e2e-int-${marker}@docket.test`;
  managerEmail = `access-e2e-mgmt-${marker}@docket.test`;
  ids.push(await createStaffUser(hrEmail, "Access E2E HR", "hr"));
  ids.push(await createStaffUser(interviewerEmail, "Access E2E Interviewer", "interviewer"));
  ids.push(await createStaffUser(managerEmail, "Access E2E Manager", "management"));
});

test.afterAll(async () => {
  await deleteUsers(ids);
});

/** Sign in on the page we were sent to, keeping its ?next= intact. */
async function signInHere(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("a deep link survives sign-in, query string included", async ({ page }) => {
  await page.goto("/positions?status=open&q=Backend");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fpositions%3Fstatus%3Dopen%26q%3DBackend$/);
  await signInHere(page, hrEmail);
  await expect(page).toHaveURL(/\/positions\?status=open&q=Backend$/);
  await expect(page.getByRole("row", { name: /Senior Backend Engineer/ })).toBeVisible();
});

test("sign-in never redirects off-site through ?next=", async ({ page, context }) => {
  // Stand-in for an attacker's page, so nothing leaves the machine.
  await context.route((url) => url.hostname === "evil.example", (route) => route.fulfill({ body: "phished" }));

  for (const next of ["https://evil.example/login", "//evil.example/login"]) {
    await context.clearCookies();
    await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
    await signInHere(page, hrEmail);
    await page.waitForURL((url) => url.host !== LOCAL_HOST || !url.pathname.startsWith("/sign-in"));
    assert.equal(new URL(page.url()).host, LOCAL_HOST, `client-side push followed next=${next}`);
  }

  // Already signed in: the server-side redirect on /sign-in must stay local too.
  for (const next of ["https://evil.example/login", "//evil.example/login"]) {
    const response = await context.request.get(`/sign-in?next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
    const location = response.headers()["location"];
    if (location) {
      assert.equal(new URL(location, BASE_URL).host, LOCAL_HOST, `server redirect followed next=${next}`);
    }
  }
});

test("user admin and the approval queue are management-only", async ({ browser }) => {
  for (const email of [hrEmail, interviewerEmail]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signInAndWait(page, email);
    for (const path of ["/admin/users", "/positions/approvals"]) {
      const response = await page.goto(path);
      assert.equal(response?.status(), 403, `${email} → ${path}`);
      await expect(page.getByRole("heading", { name: "Not allowed" })).toBeVisible();
    }
    await context.close();
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAndWait(page, managerEmail);
  assert.equal((await page.goto("/admin/users"))?.status(), 200);
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Access E2E HR/ })).toBeVisible();
  assert.equal((await page.goto("/positions/approvals"))?.status(), 200);
  await expect(page.getByRole("heading", { name: "Approval queue" })).toBeVisible();
  await context.close();
});

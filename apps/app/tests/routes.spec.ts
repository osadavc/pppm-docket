import assert from "node:assert/strict";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { applications, attachments, positions } from "@/db/schema";
import { cleanupLeftovers, createStaffUser, db, deleteUsers, signInAndWait } from "./fixtures";

/**
 * Malformed, missing and forbidden for every record route family. Uses the
 * seeded open position (Senior Backend Engineer) for the "exists" cases.
 */
const MALFORMED = "not-a-uuid";
const MISSING = "00000000-0000-4000-8000-000000000000";
const ids: string[] = [];
let hrEmail: string;
let interviewerEmail: string;
let openPositionId: string;
let applicationId: string;
let attachmentId: string | undefined;

test.beforeAll(async () => {
  await cleanupLeftovers();
  const marker = crypto.randomUUID();
  hrEmail = `routes-e2e-hr-${marker}@docket.test`;
  interviewerEmail = `routes-e2e-int-${marker}@docket.test`;
  ids.push(await createStaffUser(hrEmail, "Routes E2E HR", "hr"));
  ids.push(await createStaffUser(interviewerEmail, "Routes E2E Interviewer", "interviewer"));
  const [position] = await db.select({ id: positions.id }).from(positions).where(eq(positions.title, "Senior Backend Engineer"));
  if (!position) throw new Error("Run `bun run db:seed` first.");
  openPositionId = position.id;
  const [application] = await db.select({ id: applications.id }).from(applications).where(eq(applications.positionId, openPositionId)).limit(1);
  applicationId = application!.id;
  const [cv] = await db.select({ id: attachments.id }).from(attachments).where(eq(attachments.applicationId, applicationId)).limit(1);
  attachmentId = cv?.id;
});

test.afterAll(async () => {
  await deleteUsers(ids);
});

async function status(page: Page, path: string) {
  const response = await page.goto(path);
  return response?.status();
}

test("public careers URLs: malformed and missing are 404, existing is 200", async ({ page }) => {
  assert.equal(await status(page, `/careers/${MALFORMED}`), 404);
  assert.equal(await status(page, `/careers/${MISSING}`), 404);
  assert.equal(await status(page, `/careers/${MALFORMED}/applied`), 404);
  assert.equal(await status(page, `/careers/${MISSING}/applied`), 404);
  assert.equal(await status(page, `/careers/${openPositionId}`), 200);
  await expect(page.getByRole("heading", { name: "Page not found" })).toHaveCount(0);
});

test("signed-out staff pages redirect to sign-in; file endpoint returns 401", async ({ page, request }) => {
  for (const path of [`/positions/${MALFORMED}`, `/applications/${MISSING}`, `/candidates/${MALFORMED}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  }
  for (const id of [MALFORMED, MISSING, attachmentId ?? MISSING]) {
    const response = await request.get(`/api/files/${id}`, { maxRedirects: 0 });
    assert.equal(response.status(), 401, `anonymous ${id}`);
  }
});

test("HR: malformed and missing record ids are 404 across every family", async ({ page, context }) => {
  await signInAndWait(page, hrEmail);
  const families = [
    "/positions/{id}", "/positions/{id}/pipeline", "/positions/{id}/candidates", "/positions/{id}/review", "/positions/{id}/edit",
    "/candidates/{id}", "/applications/{id}", "/applications/{id}/feedback",
  ];
  for (const family of families) {
    for (const id of [MALFORMED, MISSING]) {
      const code = await status(page, family.replace("{id}", id));
      assert.equal(code, 404, `${family} with ${id}`);
      await expect(page.getByText("Page not found")).toBeVisible();
    }
  }
  const request = context.request;
  assert.equal((await request.get(`/api/files/${MALFORMED}`, { maxRedirects: 0 })).status(), 404);
  assert.equal((await request.get(`/api/files/${MISSING}`, { maxRedirects: 0 })).status(), 404);
  if (attachmentId) {
    const ok = await request.get(`/api/files/${attachmentId}`, { maxRedirects: 0 });
    assert.ok([302, 307].includes(ok.status()), "HR gets the signed redirect");
    const inline = await request.get(`/api/files/${attachmentId}?inline=1`, { maxRedirects: 0 });
    assert.ok([302, 307].includes(inline.status()));
  }
  assert.equal(await status(page, `/positions/${openPositionId}/stages`), 200);
});

test("interviewer: unrelated application, its file and staff-only pages are refused", async ({ page, context }) => {
  await signInAndWait(page, interviewerEmail);
  assert.equal(await status(page, `/applications/${applicationId}`), 403);
  assert.equal(await status(page, `/positions/${openPositionId}`), 403);
  assert.equal(await status(page, `/candidates/${MISSING}`), 403);
  assert.equal(await status(page, "/reports"), 403);
  if (attachmentId) {
    assert.equal((await context.request.get(`/api/files/${attachmentId}`, { maxRedirects: 0 })).status(), 403);
  }
  // Malformed still reads as not found rather than a server error.
  assert.equal(await status(page, `/applications/${MALFORMED}`), 404);
});

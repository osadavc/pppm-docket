import { expect, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { createLocalAccountIssuer } from "better-auth/db";
import { eq, inArray, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { account, activityLog, applications, candidates, positions, user } from "@/db/schema";

/**
 * Shared Playwright fixtures. Staff accounts are provisioned the way
 * createStaffAccount does — a user row plus a credential account carrying
 * better-auth's own password hash — because the public sign-up endpoint is
 * closed. No test goes through a public API to mint a user.
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Playwright.");
export const sql = postgres(databaseUrl, { prepare: false });
export const db = drizzle(sql);

export const TEST_PASSWORD = "DocketE2E!2026";
export const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? 3000}`;

export type Role = "hr" | "management" | "interviewer";

export async function createStaffUser(
  email: string,
  name: string,
  role: Role,
  options: { isActive?: boolean } = {},
) {
  const id = `e2e-${crypto.randomUUID()}`;
  const now = new Date();
  await db.insert(user).values({
    id,
    name,
    email,
    emailVerified: true,
    role,
    isActive: options.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(account).values({
    id: `e2e-acc-${crypto.randomUUID()}`,
    userId: id,
    accountId: id,
    providerId: "credential",
    issuer: createLocalAccountIssuer("credential"),
    password: await hashPassword(TEST_PASSWORD),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * Remove anything a previous, aborted run left behind. Every spec names its
 * rows with an "e2e" marker precisely so this can be blunt.
 */
export async function cleanupLeftovers() {
  // Children first: positions and candidates reference their creators.
  const stalePositions = await db
    .select({ id: positions.id })
    .from(positions)
    .where(like(positions.title, "% E2E %"));
  for (const p of stalePositions) {
    await db.delete(activityLog).where(eq(activityLog.positionId, p.id));
    await db.delete(positions).where(eq(positions.id, p.id));
  }
  const staleCandidates = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(or(like(candidates.email, "wf-%@example.com"), like(candidates.email, "app-e2e-cand-%"), like(candidates.email, "scorecard-e2e-%")));
  for (const c of staleCandidates) {
    const apps = await db.select({ id: applications.id }).from(applications).where(eq(applications.candidateId, c.id));
    for (const a of apps) await db.delete(activityLog).where(eq(activityLog.applicationId, a.id));
    await db.delete(candidates).where(eq(candidates.id, c.id));
  }
  const stale = await db
    .select({ id: user.id })
    .from(user)
    .where(like(user.email, "%-e2e-%@docket.test"));
  await deleteUsers(stale.map((u) => u.id));
}

export async function deleteUsers(ids: string[]) {
  if (ids.length === 0) return;
  await db.delete(activityLog).where(inArray(activityLog.entityId, ids));
  await db.delete(user).where(inArray(user.id, ids));
}

export async function signIn(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signInAndWait(page: Page, email: string) {
  await signIn(page, email);
  await expect(page.getByText("Signed in", { exact: true })).toBeVisible();
  // The form then pushes to its destination; navigating before that lands
  // aborts the in-flight navigation.
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

/** A tiny valid PDF for uploads. */
export function pdfFile(name = "cv.pdf") {
  const body = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n";
  return { name, mimeType: "application/pdf", buffer: Buffer.from(body, "latin1") };
}

export async function userIdByEmail(email: string | undefined) {
  if (!email) return undefined;
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return row?.id;
}

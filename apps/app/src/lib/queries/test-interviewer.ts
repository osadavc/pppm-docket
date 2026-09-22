import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";

/**
 * Integration-test helper: an active interviewer with no stage assignments,
 * for asserting that access is denied. The demo seed only has two interviewers
 * and the tests assign both, so the "unassigned" one is created per test and
 * removed again in its `finally`.
 */
export async function createUnassignedInterviewer() {
  const id = randomUUID();
  const now = new Date();
  const [row] = await db
    .insert(user)
    .values({
      id,
      name: "Unassigned Interviewer",
      email: `unassigned.${id}@example.com`,
      emailVerified: true,
      role: "interviewer",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: user.id, name: user.name, email: user.email, isActive: user.isActive });
  return {
    ...row,
    role: "interviewer" as const,
    remove: () => db.delete(user).where(eq(user.id, id)),
  };
}

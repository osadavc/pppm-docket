"use server";

import { createLocalAccountIssuer } from "better-auth/db";
import { and, count, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { account, session, user } from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/auth/guards";
import { isUserRole, ROLE_LABELS, type UserRole } from "@/lib/auth/roles";
import {
  changeRoleSchema,
  createUserSchema,
  setPasswordSchema,
  type ChangeRoleInput,
  type CreateUserInput,
  type SetPasswordInput,
} from "@/lib/validation/user";
import { fail, ok, type ActionResult } from "./result";

/**
 * Create a staff account with an explicit role.
 *
 * A Server Action is a public POST endpoint, so this re-authorizes from scratch
 * rather than trusting the layout that rendered the form.
 *
 * The user is created through better-auth's internal adapter rather than
 * `auth.api.signUpEmail()` on purpose: signUpEmail issues a session for the new
 * account, and with the nextCookies plugin active that session cookie would be
 * written onto the *administrator's* browser — silently swapping who they are
 * logged in as. Going through the adapter creates the account with no session
 * side effects, while still using better-auth's own password hasher so the new
 * user can sign in immediately.
 */
export async function createStaffAccount(
  input: CreateUserInput,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireRole("management");

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the highlighted fields.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { name, email, password, role, jobTitle, department } = parsed.data;

  const existing = await db.query.user.findFirst({
    where: eq(user.email, email),
  });
  if (existing) {
    return fail("That email already has an account.", {
      email: ["An account with this email already exists"],
    });
  }

  const ctx = await auth.$context;

  let created;
  try {
    created = await ctx.internalAdapter.createUser(
      {
        name,
        email,
        emailVerified: true,
        role,
        jobTitle: jobTitle || null,
        department: department || null,
        isActive: true,
      },
      { method: "admin" },
    );
  } catch {
    return fail("Could not create the account. Try again.");
  }

  if (!created) return fail("Could not create the account. Try again.");

  // Hashed by better-auth itself, so sign-in works with no further setup.
  await ctx.internalAdapter.linkAccount({
    providerId: "credential",
    issuer: createLocalAccountIssuer("credential"),
    accountId: created.id,
    userId: created.id,
    password: await ctx.password.hash(password),
  });

  await logActivity(db, {
    actorId: actor.id,
    action: "user.created",
    entityType: "user",
    entityId: created.id,
    summary: `${actor.name} created ${name} (${email}) as ${ROLE_LABELS[role]}`,
    metadata: { email, role, createdBy: actor.email },
  });

  revalidatePath("/admin/users");
  return ok({ id: created.id });
}

/**
 * Change a user's role.
 *
 * Takes effect on the target's next request because `session.cookieCache` is
 * disabled — see the note in lib/auth.ts. Nothing is cached, so no session
 * revocation is needed and the user stays signed in.
 */
export async function changeUserRole(
  input: ChangeRoleInput,
): Promise<ActionResult<{ id: string; role: UserRole }>> {
  const actor = await requireRole("management");

  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the highlighted fields.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { userId, role } = parsed.data;

  // AC: an administrator must not be able to demote themselves and lock
  // everyone out of user management.
  if (userId === actor.id) {
    return fail(
      "You cannot change your own role. Ask another manager to do it.",
    );
  }

  const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!target) return fail("That account no longer exists.");

  const previousRole = isUserRole(target.role) ? target.role : "interviewer";
  if (previousRole === role) {
    return ok({ id: userId, role });
  }

  // Defence in depth: even though the actor is management and therefore always
  // remains, never let the last manager be demoted by any future code path.
  if (previousRole === "management" && role !== "management") {
    const [{ count: remaining }] = await db
      .select({ count: count() })
      .from(user)
      .where(and(eq(user.role, "management"), ne(user.id, userId)));

    if (remaining === 0) {
      return fail(
        "That is the last manager. Promote someone else before demoting them.",
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(user).set({ role }).where(eq(user.id, userId));

    await logActivity(tx, {
      actorId: actor.id,
      action: "user.role_changed",
      entityType: "user",
      entityId: userId,
      summary: `${actor.name} changed ${target.name} from ${ROLE_LABELS[previousRole]} to ${ROLE_LABELS[role]}`,
      metadata: { email: target.email, from: previousRole, to: role },
    });
  });

  revalidatePath("/admin/users");
  return ok({ id: userId, role });
}

/**
 * Set a new password for a user.
 *
 * Hashed with better-auth's own hasher so the account keeps working, and all of
 * the target's sessions are deleted in the same transaction — a password reset
 * should not leave an existing session alive on someone else's machine.
 */
export async function setUserPassword(
  input: SetPasswordInput,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireRole("management");

  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Check the highlighted fields.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { userId, password } = parsed.data;

  const target = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!target) return fail("That account no longer exists.");

  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(password);

  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(account)
      .set({ password: hashed })
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .returning({ id: account.id });

    if (rows.length === 0) return false;

    // Force re-authentication everywhere with the new password.
    await tx.delete(session).where(eq(session.userId, userId));

    await logActivity(tx, {
      actorId: actor.id,
      action: "user.password_reset",
      entityType: "user",
      entityId: userId,
      summary: `${actor.name} reset the password for ${target.name} (${target.email})`,
      metadata: { email: target.email, sessionsRevoked: true },
    });

    return true;
  });

  if (!updated) {
    return fail("That account has no email/password login to reset.");
  }

  revalidatePath("/admin/users");
  return ok({ id: userId });
}

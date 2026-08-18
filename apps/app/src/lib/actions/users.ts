"use server";

import { createLocalAccountIssuer } from "better-auth/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { createUserSchema, type CreateUserInput } from "@/lib/validation/user";
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

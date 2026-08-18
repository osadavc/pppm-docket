import "server-only";

import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { can, type Permission } from "./permissions";
import { isUserRole, type UserRole } from "./roles";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: UserRole;
  jobTitle?: string | null;
  department?: string | null;
  isActive: boolean;
};

/**
 * Wrapped in React `cache()` so a request that hits the layout, the page and
 * three Server Components performs exactly one session lookup.
 */
export const getSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const raw = session.user as typeof session.user & {
    role?: unknown;
    jobTitle?: string | null;
    department?: string | null;
    isActive?: boolean | null;
  };

  const user: SessionUser = {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    image: raw.image,
    // Defensive: a row written outside the app should not crash rendering.
    role: isUserRole(raw.role) ? raw.role : "interviewer",
    jobTitle: raw.jobTitle ?? null,
    department: raw.department ?? null,
    isActive: raw.isActive ?? true,
  };

  return { session: session.session, user };
});

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getSession())?.user ?? null;
}

/** Redirects to sign-in when there is no valid session. */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      nextPath ? `/sign-in?next=${encodeURIComponent(nextPath)}` : "/sign-in",
    );
  }
  if (!user.isActive) {
    redirect("/sign-in?error=deactivated");
  }
  return user;
}

/** Requires one of the given roles; 403s otherwise. */
export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) forbidden();
  return user;
}

/** Requires a capability from the permission matrix; 403s otherwise. */
export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) forbidden();
  return user;
}

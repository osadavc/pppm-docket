import "server-only";

import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { isUserRole, type UserRole } from "@/lib/auth/roles";

export type StaffAccount = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  jobTitle: string | null;
  department: string | null;
  isActive: boolean;
  createdAt: Date;
};

export async function listStaffAccounts(): Promise<StaffAccount[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
      department: user.department,
      isActive: user.isActive,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(asc(user.role), desc(user.createdAt));

  return rows.map((r) => ({
    ...r,
    role: isUserRole(r.role) ? r.role : "interviewer",
  }));
}

/** Candidates for the hiring-manager field: anyone who is not an interviewer. */
export async function listHiringManagers() {
  const rows = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(eq(user.isActive, true))
    .orderBy(asc(user.name));

  return rows
    .filter((r) => r.role === "management" || r.role === "hr")
    .map(({ id, name }) => ({ id, name }));
}

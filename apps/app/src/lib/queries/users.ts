import "server-only";

import { asc, desc } from "drizzle-orm";
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

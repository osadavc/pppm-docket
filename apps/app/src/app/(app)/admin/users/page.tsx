import type { Metadata } from "next";
import { CreateUserDialog } from "@/components/admin/create-user-dialog";
import { UserTable } from "@/components/admin/user-table";
import { requireRole } from "@/lib/auth/guards";
import { listStaffAccounts } from "@/lib/queries/users";

export const metadata: Metadata = { title: "Users · Docket" };

export default async function AdminUsersPage() {
  // Belt and braces: the layout already gates this subtree.
  const actor = await requireRole("management");
  const users = await listStaffAccounts();

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground text-sm">
            Create staff accounts and assign the role that fits their part in
            hiring.
          </p>
        </div>
        <CreateUserDialog />
      </div>

      <UserTable users={users} currentUserId={actor.id} />
    </>
  );
}

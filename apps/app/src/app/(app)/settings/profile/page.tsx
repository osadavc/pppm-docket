import type { Metadata } from "next";
import { RoleBadge } from "@/components/layout/role-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Profile · Docket" };

export default async function ProfilePage() {
  const user = await requireUser();

  const rows: Array<[string, string]> = [
    ["Name", user.name],
    ["Email", user.email],
    ["Job title", user.jobTitle || "—"],
    ["Department", user.department || "—"],
  ];

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm">
          Your account details. Roles are assigned by management.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            <RoleBadge role={user.role} />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b pb-2 last:border-0">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

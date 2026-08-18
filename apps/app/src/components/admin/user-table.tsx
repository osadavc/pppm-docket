import { RoleBadge } from "@/components/layout/role-badge";
import { UserRowActions } from "@/components/admin/user-row-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StaffAccount } from "@/lib/queries/users";

export function UserTable({
  users,
  currentUserId,
}: {
  users: StaffAccount[];
  currentUserId: string;
}) {
  if (users.length === 0) {
    return (
      <Card className="text-muted-foreground p-10 text-center text-sm">
        No accounts yet. Create the first one to get started.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Job title</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.name}
                  {u.id === currentUserId ? (
                    <Badge variant="outline" className="ml-2 font-normal">
                      You
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <RoleBadge role={u.role} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.jobTitle || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.department || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <UserRowActions user={u} isSelf={u.id === currentUserId} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

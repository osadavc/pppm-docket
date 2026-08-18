import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PositionStatusBadge } from "@/components/positions/position-status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { listPositions } from "@/lib/queries/positions";

export const metadata: Metadata = { title: "Positions · Docket" };

export default async function PositionsPage() {
  const user = await requirePermission("position:view");
  const items = await listPositions();
  const canManage = can(user.role, "position:manage");

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Positions</h1>
          <p className="text-muted-foreground text-sm">
            Every vacancy, including drafts that are not yet advertised.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/positions/new">
              <Plus /> New position
            </Link>
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          No positions yet.
          {canManage ? " Create a draft to get started." : null}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Openings</TableHead>
                  <TableHead className="text-right">Stages</TableHead>
                  <TableHead className="text-right">Candidates</TableHead>
                  <TableHead>Deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/positions/${p.id}`} className="hover:underline">
                        {p.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.department}</TableCell>
                    <TableCell>
                      <PositionStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.openings}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.stageCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.candidateCount}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(p.applicationDeadline)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </>
  );
}

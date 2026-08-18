import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
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
import { formatDate } from "@/lib/format";
import { listPendingApprovals } from "@/lib/queries/positions";

export const metadata: Metadata = { title: "Approvals · Docket" };

export default async function ApprovalsPage() {
  await requirePermission("position:approve");
  const pending = await listPendingApprovals();

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approval queue</h1>
        <p className="text-muted-foreground text-sm">
          Positions waiting on your sign-off. Nothing is advertised until it
          clears this queue.
        </p>
      </div>

      {pending.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <CheckCircle2 className="text-muted-foreground size-8" />
          <p className="text-sm font-medium">Nothing waiting</p>
          <p className="text-muted-foreground text-sm">
            Positions submitted by HR will appear here.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Position</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Submitted by</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Hiring manager</TableHead>
                  <TableHead className="text-right">Openings</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead className="w-24 text-right">
                    <span className="sr-only">Review</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/positions/${p.id}`} className="hover:underline">
                        {p.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.department}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.submittedByName ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(p.submittedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.hiringManagerName ?? "Unassigned"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.openings}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(p.applicationDeadline)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/positions/${p.id}`}>Review</Link>
                      </Button>
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

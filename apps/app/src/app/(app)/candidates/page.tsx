import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { listCandidates } from "@/lib/queries/candidates";
import { CANDIDATE_SOURCE_LABELS } from "@/lib/validation/candidate";

export const metadata: Metadata = { title: "Candidates · Docket" };

export default async function CandidatesPage() {
  const user = await requirePermission("candidate:view");
  const rows = await listCandidates();
  const canAdd = can(user.role, "candidate:manage");

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
          <p className="text-muted-foreground text-sm">
            Everyone in the pipeline, however they reached us.
          </p>
        </div>
        {canAdd ? (
          <Button asChild>
            <Link href="/candidates/new">
              <Plus /> Add candidate
            </Link>
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          No candidates yet.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>CV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.id}-${r.positionTitle ?? "none"}`}>
                    <TableCell className="font-medium">
                      <Link href={`/candidates/${r.id}`} className="hover:underline">
                        {r.fullName}
                      </Link>
                      <span className="text-muted-foreground block text-xs">
                        {r.email}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.positionTitle ?? "—"}
                    </TableCell>
                    <TableCell>
                      {r.stageName ? (
                        <Badge variant="outline" className="font-normal">
                          {r.stageName}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {CANDIDATE_SOURCE_LABELS[r.source]}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </TableCell>
                    <TableCell>
                      {r.attachmentId ? (
                        <a
                          href={`/api/files/${r.attachmentId}`}
                          className="text-sm underline underline-offset-4"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
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

import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
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
import { requireRole } from "@/lib/auth/guards";
import { formatDate } from "@/lib/format";
import { listApplicationsVisibleToInterviewer } from "@/lib/queries/stage-interviewers";

export const metadata: Metadata = { title: "My applications · Docket" };

const pageSchema = z.coerce.number().int().min(1).catch(1);

export default async function MyApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await requireRole("interviewer");
  const page = pageSchema.parse((await searchParams).page);
  const result = await listApplicationsVisibleToInterviewer(user.id, page);
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.page * result.pageSize, result.total);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My applications</h1>
        <p className="text-muted-foreground text-sm">
          Candidates at positions where you are assigned to an interview panel.
        </p>
      </div>

      {result.rows.length === 0 ? (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          {result.total === 0
            ? "You are not assigned to any application panels yet."
            : "There are no applications on this page."}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Current stage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applied</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((application) => (
                  <TableRow key={application.applicationId}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/applications/${application.applicationId}`}
                        className="hover:underline"
                      >
                        {application.candidateName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {application.positionTitle}
                    </TableCell>
                    <TableCell>{application.currentStageName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal capitalize">
                        {application.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(application.appliedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm tabular-nums">
          {result.total === 0 ? "No applications" : `${from}–${to} of ${result.total}`}
        </p>
        <div className="flex items-center gap-2">
          <Button asChild={result.page > 1} variant="outline" size="sm" disabled={result.page <= 1}>
            {result.page > 1 ? (
              <Link href={`/my-applications?page=${result.page - 1}`}>
                <ChevronLeft /> Previous
              </Link>
            ) : (
              <span><ChevronLeft /> Previous</span>
            )}
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">
            Page {result.page} of {result.pageCount}
          </span>
          <Button
            asChild={result.page < result.pageCount}
            variant="outline"
            size="sm"
            disabled={result.page >= result.pageCount}
          >
            {result.page < result.pageCount ? (
              <Link href={`/my-applications?page=${result.page + 1}`}>
                Next <ChevronRight />
              </Link>
            ) : (
              <span>Next <ChevronRight /></span>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

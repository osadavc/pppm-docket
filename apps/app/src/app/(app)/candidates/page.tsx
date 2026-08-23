import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CandidateFilters } from "@/components/candidates/candidate-filters";
import { CandidatePagination } from "@/components/candidates/candidate-pagination";
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
import {
  listAllPositionsForFilter,
  listStagesForFilter,
  searchCandidates,
} from "@/lib/queries/candidates";
import {
  APPLICATION_STATUS_LABELS,
  buildCandidateQuery,
  parseCandidateSearch,
} from "@/lib/validation/candidate-search";
import { CANDIDATE_SOURCE_LABELS } from "@/lib/validation/candidate";

export const metadata: Metadata = { title: "Candidates · Docket" };

export default async function CandidatesPage({
  searchParams,
}: PageProps<"/candidates">) {
  const user = await requirePermission("candidate:view");
  const search = parseCandidateSearch(await searchParams);

  const [result, positions, stages] = await Promise.all([
    searchCandidates(search),
    listAllPositionsForFilter(),
    listStagesForFilter(search.positionId),
  ]);

  const canAdd = can(user.role, "candidate:manage");
  // Carried onto each row so returning from a profile lands back on the same
  // filtered page rather than at the top of an unfiltered list.
  const returnTo = buildCandidateQuery(search);

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

      <CandidateFilters positions={positions} stages={stages} />

      {result.rows.length === 0 ? (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          {result.total === 0 && !search.q && !search.positionId && !search.status
            ? "No candidates yet."
            : "No candidates match these filters."}
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
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>CV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.applicationId ?? r.candidateId}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/candidates/${r.candidateId}?from=${encodeURIComponent(returnTo)}`}
                        className="hover:underline"
                      >
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
                    <TableCell className="text-muted-foreground capitalize">
                      {r.status
                        ? APPLICATION_STATUS_LABELS[
                            r.status as keyof typeof APPLICATION_STATUS_LABELS
                          ]
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {CANDIDATE_SOURCE_LABELS[
                        r.source as keyof typeof CANDIDATE_SOURCE_LABELS
                      ]}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.appliedAt)}
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

      <CandidatePagination
        search={search}
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        pageSize={result.pageSize}
      />
    </>
  );
}

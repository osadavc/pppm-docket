import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Columns3, Plus } from "lucide-react";
import { PaceBadge } from "@/components/pipeline/pace-badge";
import { PositionCandidateSearch } from "@/components/positions/position-candidate-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PillNav } from "@/components/ui/pill-nav";
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
import { paceFor } from "@/lib/domain/pace";
import { formatDate } from "@/lib/format";
import { listStagesForFilter, searchCandidates } from "@/lib/queries/candidates";
import { getPositionTitle } from "@/lib/queries/positions";
import { CANDIDATE_SOURCE_LABELS } from "@/lib/validation/candidate";
import { APPLICATION_STATUS_LABELS } from "@/lib/validation/candidate-search";
import {
  buildPositionCandidateQuery,
  parsePositionCandidateFilter,
  toCandidateSearch,
} from "@/lib/validation/position-candidates";
import { parseUuidParam } from "@/lib/validation/params";
import { ScrollX } from "@/components/ui/scroll-x";

export const metadata: Metadata = { title: "Candidates · Docket" };

const OUTCOME_PILLS = [
  { status: "on_hold", label: "On hold" },
  { status: "hired", label: "Hired" },
  { status: "rejected", label: "Rejected" },
] as const;

/**
 * The position's applicant list, sharing the global list's query and paging
 * so its counts can never disagree with /candidates. Only the pills and the
 * fixed position are new.
 */
export default async function PositionCandidatesPage({
  params,
  searchParams,
}: PageProps<"/positions/[positionId]/candidates">) {
  const user = await requirePermission("position:view");
  const positionId = parseUuidParam((await params).positionId);
  const [position, stages] = await Promise.all([
    getPositionTitle(positionId),
    listStagesForFilter(positionId),
  ]);
  if (!position) notFound();

  const filter = parsePositionCandidateFilter(
    await searchParams,
    stages.map((s) => s.id),
  );
  const result = await searchCandidates(toCandidateSearch(positionId, filter));
  const base = `/positions/${positionId}/candidates`;
  const href = (changes: Partial<typeof filter>) =>
    `${base}${buildPositionCandidateQuery({ q: filter.q, ...changes })}`;

  const pills = [
    { key: "all", label: "All", href: href({}), active: !filter.stage && !filter.status },
    ...stages.map((s) => ({
      key: s.id,
      label: s.name,
      href: href({ stage: s.id }),
      active: filter.stage === s.id,
    })),
    ...OUTCOME_PILLS.map((o) => ({
      key: o.status,
      label: o.label,
      href: href({ status: o.status }),
      active: filter.status === o.status,
    })),
  ];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/positions/${positionId}`}
            className="text-muted-foreground mb-2 inline-flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-3.5" /> {position.title}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
          <p className="text-muted-foreground text-sm">
            Page {result.page} of {result.pageCount} · {result.total} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/positions/${positionId}/pipeline`}>
              <Columns3 /> Board view
            </Link>
          </Button>
          {can(user.role, "candidate:manage") ? (
            <Button asChild>
              <Link href="/candidates/new">
                <Plus /> Add candidate
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillNav label="Filter by stage or outcome" pills={pills} />
        <PositionCandidateSearch />
      </div>

      {result.rows.length === 0 ? (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          {result.total === 0 && !filter.q && !filter.stage && !filter.status
            ? "Nobody has applied to this position yet."
            : "No candidates match these filters."}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ScrollX>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>In stage</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.applicationId ?? r.candidateId}>
                    <TableCell className="font-medium">
                      <Link href={`/applications/${r.applicationId}`} className="hover:underline">
                        {r.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell>
                      {r.stageName ? (
                        <Badge variant="outline" className="font-normal">
                          {r.stageName}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {r.status === "active" && r.enteredAt ? (
                        <PaceBadge pace={paceFor(r.enteredAt)} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.appliedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {CANDIDATE_SOURCE_LABELS[r.source as keyof typeof CANDIDATE_SOURCE_LABELS]}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.status
                        ? APPLICATION_STATUS_LABELS[r.status as keyof typeof APPLICATION_STATUS_LABELS]
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollX>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm tabular-nums">
          Page {result.page} of {result.pageCount} · {result.total} total
        </p>
        <div className="flex items-center gap-2">
          <Button asChild={result.page > 1} variant="outline" size="sm" disabled={result.page <= 1}>
            {result.page > 1 ? (
              <Link href={href({ stage: filter.stage, status: filter.status, page: result.page - 1 })}>
                <ChevronLeft /> Previous
              </Link>
            ) : (
              <span><ChevronLeft /> Previous</span>
            )}
          </Button>
          <Button
            asChild={result.page < result.pageCount}
            variant="outline"
            size="sm"
            disabled={result.page >= result.pageCount}
          >
            {result.page < result.pageCount ? (
              <Link href={href({ stage: filter.stage, status: filter.status, page: result.page + 1 })}>
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

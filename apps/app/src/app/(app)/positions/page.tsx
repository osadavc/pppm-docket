import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PositionStatusBadge } from "@/components/positions/position-status-badge";
import { PositionCandidateSearch } from "@/components/positions/position-candidate-search";
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
import { formatDate } from "@/lib/format";
import { listPositions } from "@/lib/queries/positions";
import {
  buildPositionListQuery,
  parsePositionListSearch,
  POSITION_STATUS_PILLS,
} from "@/lib/validation/position-list";
import { ScrollX } from "@/components/ui/scroll-x";

export const metadata: Metadata = { title: "Positions · Docket" };

export default async function PositionsPage({
  searchParams,
}: PageProps<"/positions">) {
  const user = await requirePermission("position:view");
  const search = parsePositionListSearch(await searchParams);
  const result = await listPositions(search);
  const canManage = can(user.role, "position:manage");
  const filtered = Boolean(search.q || search.status);
  const href = (changes: Partial<typeof search>) =>
    `/positions${buildPositionListQuery({ q: search.q, ...changes })}`;

  const pills = [
    { key: "all", label: "All", href: href({}), active: !search.status },
    ...POSITION_STATUS_PILLS.map((p) => ({
      key: p.status,
      label: p.label,
      href: href({ status: p.status }),
      active: search.status === p.status,
    })),
  ];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Positions</h1>
          <p className="text-muted-foreground text-sm">
            Page {result.page} of {result.pageCount} · {result.total} total
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

      <div className="flex flex-wrap items-center gap-3">
        <PillNav label="Filter by status" pills={pills} />
        <PositionCandidateSearch placeholder="Search title or department" />
      </div>

      {result.rows.length === 0 ? (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          {filtered
            ? "No positions match. Try clearing the search or status filter."
            : `Open your first position${canManage ? ". Create a draft to get started." : "."}`}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ScrollX>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Openings</TableHead>
                  <TableHead className="text-right">Stages</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                  <TableHead className="text-right">On hold</TableHead>
                  <TableHead>Deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((p) => (
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
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {p.onHoldCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(p.applicationDeadline)}
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
              <Link href={href({ status: search.status, page: result.page - 1 })}>
                <ChevronLeft /> Previous
              </Link>
            ) : (
              <><ChevronLeft /> Previous</>
            )}
          </Button>
          <Button
            asChild={result.page < result.pageCount}
            variant="outline"
            size="sm"
            disabled={result.page >= result.pageCount}
          >
            {result.page < result.pageCount ? (
              <Link href={href({ status: search.status, page: result.page + 1 })}>
                Next <ChevronRight />
              </Link>
            ) : (
              <>Next <ChevronRight /></>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck, List, Plus, TriangleAlert } from "lucide-react";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PACE_THRESHOLDS } from "@/lib/domain/pace";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { getPipelineBoard } from "@/lib/queries/pipeline";
import { getPositionTitle } from "@/lib/queries/positions";
import { parseUuidParam } from "@/lib/validation/params";

export const metadata: Metadata = { title: "Pipeline · Docket" };

function ResolvedStrip({
  positionId,
  resolved,
}: {
  positionId: string;
  resolved: { hired: number; onHold: number; rejected: number };
}) {
  const items = [
    { label: "Hired", n: resolved.hired, status: "hired" },
    { label: "On hold", n: resolved.onHold, status: "on_hold" },
    { label: "Rejected", n: resolved.rejected, status: "rejected" },
  ];
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {items.map((item) => (
        <div key={item.status} className="flex items-baseline gap-1.5">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="font-medium tabular-nums">
            <Link
              href={`/positions/${positionId}/candidates?status=${item.status}`}
              className="hover:underline"
            >
              {item.n}
            </Link>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default async function PipelinePage({
  params,
}: PageProps<"/positions/[positionId]/pipeline">) {
  const user = await requirePermission("position:view");
  const positionId = parseUuidParam((await params).positionId);

  const position = await getPositionTitle(positionId);
  if (!position) notFound();

  const board = await getPipelineBoard(positionId);
  const canAdd = can(user.role, "candidate:manage");
  const review = board.firstStage;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/positions/${position.id}`}
            className="text-muted-foreground mb-2 inline-flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-3.5" /> {position.title}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-muted-foreground text-sm">
            {board.total} active candidate{board.total === 1 ? "" : "s"}. Time shown
            is how long since each one last moved — green under{" "}
            {PACE_THRESHOLDS.amberFrom} days, amber {PACE_THRESHOLDS.amberFrom} to{" "}
            {PACE_THRESHOLDS.redFrom - 1}, red beyond.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {review && review.reviewable > 0 ? (
            <Button asChild>
              <Link href={`/positions/${position.id}/review`}>
                <ClipboardCheck /> Review {review.reviewable} at {review.name}
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href={`/positions/${position.id}/candidates`}>
              <List /> List view
            </Link>
          </Button>
          {canAdd ? (
            <Button asChild variant="outline">
              <Link href="/candidates/new">
                <Plus /> Add candidate
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <ResolvedStrip positionId={position.id} resolved={board.resolved} />

      {board.stalled > 0 ? (
        <Alert>
          <TriangleAlert />
          <AlertDescription>
            {board.stalled} candidate{board.stalled === 1 ? " has" : "s have"} been
            waiting more than {PACE_THRESHOLDS.redFrom - 1} days in the same stage.
          </AlertDescription>
        </Alert>
      ) : null}

      <PipelineBoard columns={board.columns} positionId={position.id} />
    </>
  );
}

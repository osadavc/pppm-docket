import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PACE_THRESHOLDS } from "@/lib/domain/pace";
import { requirePermission } from "@/lib/auth/guards";
import { getPipelineBoard } from "@/lib/queries/pipeline";
import { getPosition } from "@/lib/queries/positions";

export const metadata: Metadata = { title: "Pipeline · Docket" };

export default async function PipelinePage({
  params,
}: PageProps<"/positions/[positionId]/pipeline">) {
  const { positionId } = await params;
  if (!z.uuid().safeParse(positionId).success) notFound();

  await requirePermission("position:view");

  const position = await getPosition(positionId);
  if (!position) notFound();

  const board = await getPipelineBoard(positionId);

  return (
    <>
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

      {board.stalled > 0 ? (
        <Alert>
          <TriangleAlert />
          <AlertDescription>
            {board.stalled} candidate{board.stalled === 1 ? " has" : "s have"} been
            waiting more than {PACE_THRESHOLDS.redFrom - 1} days in the same stage.
          </AlertDescription>
        </Alert>
      ) : null}

      <PipelineBoard columns={board.columns} />
    </>
  );
}

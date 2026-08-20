import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StageEditor, type EditableStage } from "@/components/positions/stage-editor";
import { requirePermission } from "@/lib/auth/guards";
import { getPosition } from "@/lib/queries/positions";
import {
  getStageOccupancy,
  getStagePanels,
  listAssignableInterviewers,
} from "@/lib/queries/stage-interviewers";

export const metadata: Metadata = { title: "Interview stages · Docket" };

export default async function PositionStagesPage({
  params,
}: PageProps<"/positions/[positionId]/stages">) {
  // Management-only: the interview process for a role belongs to the manager
  // hiring for it.
  await requirePermission("position:stages:manage");
  const { positionId } = await params;

  const position = await getPosition(positionId);
  if (!position) notFound();

  const [panelMap, occupancyMap, assignableInterviewers] = await Promise.all([
    getStagePanels(positionId),
    getStageOccupancy(positionId),
    listAssignableInterviewers(),
  ]);
  const panels = Object.fromEntries(panelMap);
  const occupancy = Object.fromEntries(occupancyMap);

  const toEditable = (s: (typeof position.stages)[number]): EditableStage => ({
    id: s.id,
    isArchived: s.isArchived,
    name: s.name,
    description: s.description ?? "",
    kind: s.kind,
    requiresScorecard: s.requiresScorecard,
    minScorecards: s.minScorecards,
    slaDays: s.slaDays ?? "",
  });

  const stages = position.stages.filter((s) => !s.isArchived).map(toEditable);
  const archivedStages = position.stages.filter((s) => s.isArchived).map(toEditable);

  return (
    <>
      <div>
        <Link
          href={`/positions/${position.id}`}
          className="text-muted-foreground mb-2 inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-3.5" /> {position.title}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Interview stages</h1>
        <p className="text-muted-foreground text-sm">
          This sequence belongs to this position alone. Changing it affects no
          other role and no template.
        </p>
      </div>

      <div className="max-w-3xl">
        <StageEditor
          positionId={position.id}
          stages={stages}
          archivedStages={archivedStages}
          panels={panels}
          occupancy={occupancy}
          assignableInterviewers={assignableInterviewers}
        />
      </div>
    </>
  );
}

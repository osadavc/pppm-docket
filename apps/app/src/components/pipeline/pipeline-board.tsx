import Link from "next/link";
import { PaceBadge } from "@/components/pipeline/pace-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  PIPELINE_CARDS_PER_STAGE,
  type BoardColumn,
} from "@/lib/queries/pipeline";

export function PipelineBoard({
  columns,
  positionId,
}: {
  columns: BoardColumn[];
  positionId: string;
}) {
  if (columns.length === 0) {
    return (
      <Card className="text-muted-foreground p-10 text-center text-sm">
        This position has no active stages.
      </Card>
    );
  }

  return (
    // Horizontal scroll on the board itself, so the page never scrolls sideways.
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
      <div className="flex min-w-max gap-4">
        {columns.map((column) => (
          <section key={column.stageId} className="flex w-72 shrink-0 flex-col gap-3">
            <header className="flex items-center justify-between gap-2">
              <h2 className="truncate text-sm font-medium">{column.name}</h2>
              <Badge variant="secondary" className="shrink-0 tabular-nums">
                {column.count}
              </Badge>
            </header>

            <div className="flex flex-col gap-2">
              {column.candidates.length === 0 ? (
                <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
                  Nobody here
                </p>
              ) : (
                column.candidates.map((c) => (
                  <Link
                    key={c.applicationId}
                    // The application, not the candidate: interviewers can open
                    // this but have no access to the candidate directory.
                    href={`/applications/${c.applicationId}`}
                    className="hover:bg-accent/50 block rounded-lg border p-3 transition-colors"
                  >
                    <p className="truncate text-sm font-medium">{c.fullName}</p>
                    {c.currentTitle ? (
                      <p className="text-muted-foreground truncate text-xs">
                        {c.currentTitle}
                      </p>
                    ) : null}
                    <div className="mt-2">
                      <PaceBadge pace={c.pace} />
                    </div>
                  </Link>
                ))
              )}
            </div>

            {column.count > PIPELINE_CARDS_PER_STAGE ? (
              <div className="text-muted-foreground text-xs">
                <p>
                  Showing {PIPELINE_CARDS_PER_STAGE} of {column.count}
                </p>
                <Link
                  href={`/candidates?positionId=${encodeURIComponent(positionId)}&stageId=${encodeURIComponent(column.stageId)}`}
                  className="text-foreground font-medium underline underline-offset-4"
                >
                  View all candidates
                </Link>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

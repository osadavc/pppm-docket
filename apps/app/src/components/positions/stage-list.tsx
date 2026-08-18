import { Badge } from "@/components/ui/badge";
import type { PositionStage, ScorecardCriterion } from "@/db/schema";

type StageWithCriteria = PositionStage & { criteria: ScorecardCriterion[] };

export function StageList({ stages }: { stages: StageWithCriteria[] }) {
  if (stages.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No stages configured for this position.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {stages.map((stage, index) => (
        <li key={stage.id} className="flex gap-4">
          <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5 border-b pb-4 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{stage.name}</span>
              {stage.requiresScorecard ? (
                <Badge variant="outline" className="font-normal">
                  {stage.minScorecards} scorecard{stage.minScorecards === 1 ? "" : "s"} required
                </Badge>
              ) : (
                <Badge variant="secondary" className="font-normal">
                  No feedback required
                </Badge>
              )}
              {stage.slaDays ? (
                <span className="text-muted-foreground text-xs">
                  target {stage.slaDays} days
                </span>
              ) : null}
            </div>
            {stage.description ? (
              <p className="text-muted-foreground text-sm">{stage.description}</p>
            ) : null}
            {stage.criteria.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                Scored on:{" "}
                {stage.criteria
                  .slice()
                  .sort((a, b) => a.orderIndex - b.orderIndex)
                  .map((c) => `${c.label} (×${c.weight})`)
                  .join(", ")}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

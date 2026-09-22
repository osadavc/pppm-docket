import { Check, X } from "lucide-react";
import type { StepperStage } from "@/lib/queries/activity";
import { cn } from "@/lib/utils";

/**
 * "{n} {stage}" for every stage on the candidate's path: passed, current
 * (highlighted), upcoming, and, muted, archived stages they went through
 * before the pipeline changed under them.
 */
export function StageStepper({ stages }: { stages: StepperStage[] }) {
  if (stages.length === 0) return null;

  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Stages">
      {stages.map((stage, index) => {
        const done = stage.progress === "passed" || stage.progress === "skipped";
        const failed = stage.progress === "failed";
        return (
          <li key={stage.id} className="flex items-center gap-2">
            <span
              aria-current={stage.isCurrent ? "step" : undefined}
              title={
                stage.isArchived
                  ? `${stage.name} (archived stage)`
                  : stage.progress === "skipped"
                    ? `${stage.name} (skipped)`
                    : undefined
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                stage.isCurrent
                  ? "bg-primary text-primary-foreground border-primary"
                  : done
                    ? "bg-muted text-foreground"
                    : failed
                      ? "border-destructive/40 text-destructive"
                      : "text-muted-foreground",
                stage.isArchived && "opacity-60 line-through decoration-1",
              )}
            >
              <span className="tabular-nums">{index + 1}</span>
              {stage.name}
              {done ? <Check className="size-3" aria-hidden /> : null}
              {failed ? <X className="size-3" aria-hidden /> : null}
            </span>
            {index < stages.length - 1 ? (
              <span className="bg-border h-px w-3" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

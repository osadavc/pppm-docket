import type { FunnelBar } from "@/lib/queries/analytics";
import { cn } from "@/lib/utils";

/**
 * Each stage is sized against the first, so the shape of the funnel reads at
 * a glance. The right column is the share of all applicants that got this far.
 */
export const Funnel = ({ bars }: { bars: FunnelBar[] }) => {
  const top = Math.max(1, bars[0]?.count ?? 0);
  return (
    <ol className="space-y-1.5">
      {bars.map((bar, index) => {
        const isHired = bar.stageId === null;
        const width = Math.max(bar.count > 0 ? 1.5 : 0, (bar.count / top) * 100);
        return (
          <li
            key={bar.stageId ?? `hired-${index}`}
            className="grid grid-cols-[minmax(0,9.5rem)_1fr_2.5rem_2.75rem] items-center gap-3 text-sm"
          >
            <span className={cn("truncate", isHired && "font-medium")} title={bar.label}>
              {bar.label}
            </span>
            <span className="bg-muted/70 relative block h-6 overflow-hidden rounded-md" aria-hidden>
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-md",
                  isHired ? "bg-positive/80" : "bg-foreground/80",
                )}
                style={{ width: `${width}%`, opacity: isHired ? 1 : Math.max(0.45, 1 - index * 0.12) }}
              />
            </span>
            <span className="text-right font-medium tabular-nums">{bar.count}</span>
            <span className="text-muted-foreground text-right text-xs tabular-nums">
              {Math.round((bar.count / top) * 100)}%
            </span>
          </li>
        );
      })}
    </ol>
  );
};

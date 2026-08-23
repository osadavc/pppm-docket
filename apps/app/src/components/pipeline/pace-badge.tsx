import { cn } from "@/lib/utils";
import { PACE_DESCRIPTIONS, type Pace } from "@/lib/domain/pace";

/**
 * Colour is not the only signal: the day count is always spelled out and the
 * title carries the meaning, so the board is still readable without relying on
 * distinguishing green from red.
 */
const STYLES: Record<Pace["level"], string> = {
  green:
    "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  amber:
    "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  red: "border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

const DOTS: Record<Pace["level"], string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export function PaceBadge({ pace }: { pace: Pace }) {
  return (
    <span
      title={`${PACE_DESCRIPTIONS[pace.level]} — ${pace.label} in this stage`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        STYLES[pace.level],
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOTS[pace.level])} aria-hidden />
      {pace.label}
      <span className="sr-only"> in stage — {PACE_DESCRIPTIONS[pace.level]}</span>
    </span>
  );
}

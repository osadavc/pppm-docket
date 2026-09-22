import { cn } from "@/lib/utils";

export type BarDatum = { key: string; label: string; value: number; hint?: string };

/**
 * Horizontal CSS bars. The value is always printed next to the bar, so the
 * chart reads without judging lengths, and colours come from theme tokens so
 * it holds up in dark mode.
 */
export function BarList({
  data,
  max,
  tone = "bg-primary/70",
  emptyText = "Nothing to show yet.",
}: {
  data: BarDatum[];
  /** Scale reference; defaults to the largest value. */
  max?: number;
  tone?: string;
  emptyText?: string;
}) {
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyText}</p>;
  }
  const scale = Math.max(1, max ?? Math.max(...data.map((d) => d.value)));
  return (
    <ol className="space-y-2">
      {data.map((d) => (
        <li key={d.key} className="grid grid-cols-[minmax(6rem,11rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={d.label}>
            {d.label}
          </span>
          <span className="bg-muted h-3 overflow-hidden rounded-full" aria-hidden>
            <span
              className={cn("block h-full rounded-full", tone)}
              style={{ width: `${Math.max(d.value > 0 ? 2 : 0, Math.round((d.value / scale) * 100))}%` }}
            />
          </span>
          <span className="w-16 text-right tabular-nums">
            {d.value}
            {d.hint ? <span className="text-muted-foreground"> {d.hint}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

import { cn } from "@/lib/utils";

export type BarDatum = { key: string; label: string; value: number; hint?: string };

const percent = (value: number, total: number) =>
  total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";

/**
 * Horizontal CSS bars. The value is always printed next to the bar, so the
 * chart reads without judging lengths, and colours come from theme tokens so
 * it holds up in dark mode.
 */
export const BarList = ({
  data,
  max,
  tone = "bg-foreground/75",
  showShare,
  emptyText = "Nothing to show yet.",
}: {
  data: BarDatum[];
  /** Scale reference; defaults to the largest value. */
  max?: number;
  tone?: string;
  showShare?: boolean;
  emptyText?: string;
}) => {
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyText}</p>;
  }
  const scale = Math.max(1, max ?? Math.max(...data.map((d) => d.value)));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <ol className="space-y-4">
      {data.map((d) => (
        <li key={d.key} className="space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate" title={d.label}>
              {d.label}
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium">{d.value}</span>
              {d.hint ? <span className="text-muted-foreground"> {d.hint}</span> : null}
              {showShare ? (
                <span className="text-muted-foreground ml-2 inline-block w-9 text-right text-xs">
                  {percent(d.value, total)}
                </span>
              ) : null}
            </span>
          </div>
          <span className="bg-muted block h-1.5 overflow-hidden rounded-full" aria-hidden>
            <span
              className={cn("block h-full rounded-full", tone)}
              style={{ width: `${Math.max(d.value > 0 ? 2 : 0, Math.round((d.value / scale) * 100))}%` }}
            />
          </span>
        </li>
      ))}
    </ol>
  );
};

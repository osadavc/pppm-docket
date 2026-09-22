import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BarList } from "@/components/reports/bar-list";
import { Funnel } from "@/components/reports/funnel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  getDropoutReasons,
  getKpis,
  getStageFunnels,
  getTimeToFill,
} from "@/lib/queries/analytics";
import { getRecentActivity } from "@/lib/queries/dashboard";

export const metadata: Metadata = { title: "Analytics · Docket" };

const Metric = ({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
}) => (
  <div className="bg-card flex flex-col gap-1 px-5 py-4">
    <span className="text-muted-foreground text-xs font-medium">{label}</span>
    <span className="text-3xl font-semibold tracking-tight tabular-nums">
      {value}
      {unit ? <span className="text-muted-foreground ml-1 text-base font-normal">{unit}</span> : null}
    </span>
    {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
  </div>
);

/**
 * How the hiring machine is doing. Every figure comes from a grouped
 * aggregate; the page never loads applications to count them.
 */
export default async function ReportsPage() {
  await requirePermission("report:view");
  const [kpis, funnels, dropouts, timeToFill, activity] = await Promise.all([
    getKpis(),
    getStageFunnels(),
    getDropoutReasons(),
    getTimeToFill(),
    getRecentActivity(12),
  ]);
  const dropoutTotal = dropouts.reduce((s, d) => s + d.count, 0);
  const longestFill = Math.max(1, ...timeToFill.map((t) => t.days ?? 0));

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm">
          Where candidates stall or drop out, and how long roles take to fill.
        </p>
      </div>

      <Card className="py-0">
        <div className="bg-border grid grid-cols-2 gap-px lg:grid-cols-4">
          <Metric label="Open positions" value={kpis.openPositions} />
          <Metric label="Active candidates" value={kpis.activeCandidates} />
          <Metric label="Hired" value={kpis.hired} />
          <Metric
            label="Average time to hire"
            value={kpis.averageTimeToHireDays === null ? "-" : kpis.averageTimeToHireDays.toFixed(1)}
            unit={kpis.averageTimeToHireDays === null ? undefined : "days"}
            hint="From application to hire decision"
          />
        </div>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Stage funnels</h2>
          <p className="text-muted-foreground text-sm">
            How many applicants reached each stage, as a share of everyone who applied.
          </p>
        </div>
        {funnels.length === 0 ? (
          <Card className="text-muted-foreground p-6 text-sm">No open or filled positions yet.</Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {funnels.map((f) => (
              <Card key={f.positionId}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="truncate">{f.title}</span>
                    <Badge variant="outline" className="text-muted-foreground font-normal capitalize">
                      {f.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="tabular-nums">
                    {f.bars[0]?.count ?? 0} applied · {f.bars.at(-1)?.count ?? 0} hired
                  </CardDescription>
                  <CardAction>
                    <Link
                      href={`/positions/${f.positionId}/pipeline`}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-xs transition-colors"
                    >
                      Pipeline <ArrowUpRight className="size-3.5" />
                    </Link>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <Funnel bars={f.bars} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Why candidates drop out</CardTitle>
            <CardDescription>
              {dropoutTotal} rejection{dropoutTotal === 1 ? "" : "s"} across every position.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              data={dropouts.map((d) => ({ key: d.reason, label: d.label, value: d.count }))}
              showShare
              emptyText="No rejections recorded yet."
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Time to fill</CardTitle>
            <CardDescription>Days from opening to closing, per filled position.</CardDescription>
          </CardHeader>
          <CardContent>
            {timeToFill.length === 0 ? (
              <p className="text-muted-foreground text-sm">No position has been filled yet.</p>
            ) : (
              <ul className="space-y-4">
                {timeToFill.map((t) => (
                  <li key={t.positionId} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <Link href={`/positions/${t.positionId}`} className="truncate hover:underline">
                        {t.title}
                      </Link>
                      <span className="shrink-0 tabular-nums">
                        {t.days === null ? (
                          <span className="text-muted-foreground">No dates</span>
                        ) : (
                          <>
                            <span className="font-medium">{t.days}</span>
                            <span className="text-muted-foreground"> days</span>
                          </>
                        )}
                      </span>
                    </div>
                    <span className="bg-muted block h-1.5 overflow-hidden rounded-full" aria-hidden>
                      <span
                        className="bg-foreground/75 block h-full rounded-full"
                        style={{ width: `${Math.round(((t.days ?? 0) / longestFill) * 100)}%` }}
                      />
                    </span>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatDate(t.openedAt)} to {formatDate(t.closedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>The last {activity.length || 12} application events.</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>
          ) : (
            <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[3px] before:w-px before:bg-border">
              {activity.map((r) => (
                <li key={r.id} className="relative flex gap-3 pl-5 text-sm">
                  <span className="bg-background ring-foreground/25 absolute top-1.5 left-0 size-[7px] rounded-full ring-2" />
                  <div className="min-w-0 flex-1">
                    {r.applicationId ? (
                      <Link href={`/applications/${r.applicationId}`} className="hover:underline">
                        {r.summary}
                      </Link>
                    ) : (
                      r.summary
                    )}
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {r.actorName ?? "Candidate via careers site"} · {formatDateTime(r.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  );
}

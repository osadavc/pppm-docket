import type { Metadata } from "next";
import Link from "next/link";
import { BarList } from "@/components/reports/bar-list";
import { Badge } from "@/components/ui/badge";
import {
  Card,
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

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? <CardContent className="text-muted-foreground text-xs">{hint}</CardContent> : null}
    </Card>
  );
}

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

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm">
          Where candidates stall or drop out, and how long roles take to fill.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Open positions" value={String(kpis.openPositions)} />
        <Tile label="Active candidates" value={String(kpis.activeCandidates)} />
        <Tile label="Hired" value={String(kpis.hired)} />
        <Tile
          label="Average time to hire"
          value={kpis.averageTimeToHireDays === null ? "-" : `${kpis.averageTimeToHireDays.toFixed(1)} d`}
          hint="Decision date minus applied date, over hired candidates."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stage funnels</CardTitle>
          <CardDescription>
            Applications that ever entered each stage, per open or filled position, ending in hires.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          {funnels.length === 0 ? (
            <p className="text-muted-foreground text-sm">No open or filled positions yet.</p>
          ) : (
            funnels.map((f) => (
              <section key={f.positionId} className="space-y-2">
                <h2 className="flex items-center gap-2 text-sm font-medium">
                  <Link href={`/positions/${f.positionId}/pipeline`} className="hover:underline">
                    {f.title}
                  </Link>
                  <Badge variant="outline" className="font-normal capitalize">
                    {f.status}
                  </Badge>
                </h2>
                <BarList
                  data={f.bars.map((b, i) => ({
                    key: b.stageId ?? `hired-${i}`,
                    label: b.label,
                    value: b.count,
                  }))}
                />
              </section>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Why candidates drop out</CardTitle>
            <CardDescription>
              {dropoutTotal} rejection{dropoutTotal === 1 ? "" : "s"} across every position, by reason.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              data={dropouts.map((d) => ({ key: d.reason, label: d.label, value: d.count }))}
              tone="bg-destructive/70"
              emptyText="No rejections recorded yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Time to fill</CardTitle>
            <CardDescription>Filled positions: days from opening to closing.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              data={timeToFill.map((t) => ({
                key: t.positionId,
                label: t.title,
                value: t.days ?? 0,
                hint: t.days === null ? "(no dates)" : "d",
              }))}
              emptyText="No position has been filled yet."
            />
            {timeToFill.length > 0 ? (
              <ul className="text-muted-foreground mt-3 space-y-1 text-xs">
                {timeToFill.map((t) => (
                  <li key={t.positionId}>
                    {t.title}: opened {formatDate(t.openedAt)}, closed {formatDate(t.closedAt)}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>The last 12 application events.</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>
          ) : (
            <ul className="divide-y">
              {activity.map((r) => (
                <li key={r.id} className="py-2 text-sm">
                  {r.applicationId ? (
                    <Link href={`/applications/${r.applicationId}`} className="hover:underline">
                      {r.summary}
                    </Link>
                  ) : (
                    r.summary
                  )}
                  <p className="text-muted-foreground text-xs">
                    {r.actorName ?? "Candidate via careers site"} · {formatDateTime(r.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { PaceBadge } from "@/components/pipeline/pace-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { PACE_THRESHOLDS } from "@/lib/domain/pace";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  getPendingApprovals,
  getPositionsOverview,
  getRecentActivity,
  type PositionOverview,
  type RecentActivityRow,
} from "@/lib/queries/dashboard";
import { getMyQueue, type QueueCandidate } from "@/lib/queries/queue";
import type { PendingApproval } from "@/lib/queries/positions";

export const metadata: Metadata = { title: "Dashboard · Docket" };

const FEEDBACK_ROWS = 6;

function FeedbackSection({
  rows,
  total,
}: {
  rows: QueueCandidate[];
  total: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Waiting on your feedback</CardTitle>
        <CardDescription>
          {total === 0
            ? "No active candidates are waiting on your scorecard."
            : `${total} active ${total === 1 ? "candidate is" : "candidates are"} waiting on your submitted scorecard.`}
        </CardDescription>
        {total > 0 ? (
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href="/queue">
                All {total} <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      {rows.length > 0 ? (
        <CardContent>
          <ul className="divide-y">
            {rows.map((c) => (
              <li key={c.applicationId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <Link href={`/applications/${c.applicationId}/feedback`} className="font-medium hover:underline">
                    {c.candidateName}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {c.positionTitle} · {c.stageName}
                  </p>
                </div>
                <PaceBadge pace={c.pace} />
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}

function ApprovalsSection({ approvals }: { approvals: PendingApproval[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Waiting on your approval</CardTitle>
        <CardDescription>
          {approvals.length === 0
            ? "No positions are waiting for sign-off."
            : `${approvals.length} position${approvals.length === 1 ? "" : "s"} submitted for approval.`}
        </CardDescription>
        {approvals.length > 0 ? (
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href="/positions/approvals">
                Review <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      {approvals.length > 0 ? (
        <CardContent>
          <ul className="divide-y">
            {approvals.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <Link href={`/positions/${p.id}`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {p.department} · requested by {p.submittedByName ?? "-"}
                    {p.submittedAt ? ` on ${formatDate(p.submittedAt)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}

function PositionsSection({ rows }: { rows: PositionOverview[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Open positions</CardTitle>
        <CardDescription>
          {rows.length === 0
            ? "Nothing is open right now."
            : `${rows.length} open. Stuck means ${PACE_THRESHOLDS.redFrom}+ days in the same stage.`}
        </CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/positions">All positions</Link>
          </Button>
        </CardAction>
      </CardHeader>
      {rows.length > 0 ? (
        <CardContent>
          <ul className="divide-y">
            {rows.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <Link href={`/positions/${p.id}/pipeline`} className="font-medium hover:underline">
                    {p.title}
                  </Link>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {p.active} active · {p.stuck} stuck {PACE_THRESHOLDS.redFrom}+ days ·{" "}
                    {p.hired}/{p.openings} hired
                  </p>
                </div>
                {p.blockedOnFeedback > 0 ? (
                  <Badge variant="destructive">
                    {p.blockedOnFeedback} candidate{p.blockedOnFeedback === 1 ? "" : "s"} blocked on feedback
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}

function ActivitySection({ rows }: { rows: RecentActivityRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>The last {rows.length || 8} application events.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
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
  );
}

/**
 * The landing page shows the work, not the menu. Every number is a grouped
 * count; the only rows loaded are the ones rendered.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const isStaff = can(user.role, "position:view");
  const approves = can(user.role, "position:approve");

  const [queue, approvals, overview, activity] = await Promise.all([
    getMyQueue(user.id, 1),
    approves ? getPendingApprovals() : [],
    isStaff ? getPositionsOverview() : [],
    isStaff ? getRecentActivity(8) : [],
  ]);
  const awaiting = queue.awaiting.slice(0, FEEDBACK_ROWS);
  const onAPanel = queue.summary.total > 0;

  if (!isStaff) {
    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {user.name.split(" ")[0]}
          </h1>
        </div>
        {onAPanel ? (
          <FeedbackSection rows={awaiting} total={queue.summary.awaiting} />
        ) : (
          <Card className="p-10 text-center">
            <ClipboardCheck className="text-muted-foreground mx-auto size-8" />
            <p className="mt-3 font-medium">Nothing needs you right now.</p>
            <p className="text-muted-foreground text-sm">
              New tasks land here the moment they exist.
            </p>
          </Card>
        )}
      </>
    );
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {user.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm">What needs a decision today.</p>
      </div>

      {approves ? <ApprovalsSection approvals={approvals} /> : null}
      {onAPanel ? <FeedbackSection rows={awaiting} total={queue.summary.awaiting} /> : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PositionsSection rows={overview} />
        <ActivitySection rows={activity} />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CircleSlash,
  Clock,
  Columns3,
  EyeOff,
  Pencil,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { PositionStatusBadge } from "@/components/positions/position-status-badge";
import { StageList } from "@/components/positions/stage-list";
import { SubmitForApprovalButton } from "@/components/positions/submit-for-approval-button";
import { ReviewDecisionButtons } from "@/components/positions/review-decision-buttons";
import { ClosePositionDialog } from "@/components/positions/close-position-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { EMPLOYMENT_TYPE_LABELS, formatDate } from "@/lib/format";
import {
  isTerminalStatus,
  POSITION_STATUS_LABELS,
} from "@/lib/domain/position-status";
import { getFillSummary, getPosition } from "@/lib/queries/positions";
import { getStagePanels } from "@/lib/queries/stage-interviewers";
import { getRejectionBreakdown } from "@/lib/queries/applications";

export const metadata: Metadata = { title: "Position · Docket" };

export default async function PositionPage({
  params,
}: PageProps<"/positions/[positionId]">) {
  const user = await requirePermission("position:view");
  const { positionId } = await params;

  const position = await getPosition(positionId);
  if (!position) notFound();

  const canManage = can(user.role, "position:manage");
  const canSubmit = can(user.role, "position:submit") && position.status === "draft";
  const canDecide =
    can(user.role, "position:approve") && position.status === "pending_approval";
  const wasRejected =
    position.lastReviewDecision === "rejected" && position.status === "draft";
  const canConfigureStages = can(user.role, "position:stages:manage");
  const panels = Object.fromEntries(await getStagePanels(position.id));
  const rejections = await getRejectionBreakdown(position.id);
  const rejectedTotal = rejections.reduce((sum, r) => sum + r.count, 0);
  // Archived stages stay on the record but are not part of the live process.
  const activeStages = position.stages.filter((s) => !s.isArchived);
  const archivedCount = position.stages.length - activeStages.length;
  const canEndSearch =
    can(user.role, "position:manage") &&
    (position.status === "open" || position.status === "on_hold");
  const fillSummary = canEndSearch ? await getFillSummary(position.id) : null;
  const isEnded = isTerminalStatus(position.status);
  const salary =
    position.salaryMin || position.salaryMax
      ? `${position.salaryMin?.toLocaleString() ?? "…"} – ${position.salaryMax?.toLocaleString() ?? "…"}`
      : "—";

  const facts: Array<[string, string]> = [
    ["Department", position.department],
    ["Location", position.location || "—"],
    ["Employment type", EMPLOYMENT_TYPE_LABELS[position.employmentType]],
    ["Openings", String(position.openings)],
    ["Application deadline", formatDate(position.applicationDeadline)],
    ["Opened", formatDate(position.openedAt)],
    ["Closed", formatDate(position.closedAt)],
    ["Salary range", salary],
    ["Hiring manager", position.hiringManager?.name ?? "Unassigned"],
    [
      "Feedback gate",
      position.requireFeedbackToAdvance ? "Required to advance" : "Not enforced",
    ],
  ];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{position.title}</h1>
            <PositionStatusBadge status={position.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            Created by {position.createdBy?.name ?? "—"} on{" "}
            {formatDate(position.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/positions/${position.id}/pipeline`}>
              <Columns3 /> Pipeline
            </Link>
          </Button>
          {canManage ? (
            <Button asChild variant="outline">
              <Link href={`/positions/${position.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          ) : null}
          {canSubmit ? (
            <SubmitForApprovalButton positionId={position.id} title={position.title} />
          ) : null}
          {canDecide ? (
            <ReviewDecisionButtons positionId={position.id} title={position.title} />
          ) : null}
          {canEndSearch && fillSummary ? (
            <ClosePositionDialog
              positionId={position.id}
              title={position.title}
              summary={fillSummary}
            />
          ) : null}
        </div>
      </div>

      {isEnded ? (
        <Alert>
          <CircleSlash />
          <AlertTitle>
            {POSITION_STATUS_LABELS[position.status]} on {formatDate(position.closedAt)}
          </AlertTitle>
          <AlertDescription className="space-y-1">
            <span className="block">
              This position is off the careers board and no longer accepts
              applications.
            </span>
            {position.closureNote ? (
              <span className="block whitespace-pre-wrap opacity-90">
                {position.closureNote}
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {wasRejected ? (
        <Alert variant="destructive">
          <Undo2 />
          <AlertTitle>Returned by management</AlertTitle>
          <AlertDescription className="space-y-2">
            <span className="block whitespace-pre-wrap">{position.reviewNote}</span>
            <span className="block text-xs opacity-80">
              {position.reviewedBy?.name ?? "Management"} · {formatDate(position.reviewedAt)}
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {position.status === "pending_approval" ? (
        <Alert>
          <Clock />
          <AlertTitle>Awaiting management approval</AlertTitle>
          <AlertDescription>
            Submitted by {position.submittedBy?.name ?? "—"} on{" "}
            {formatDate(position.submittedAt)}. It cannot be advertised until
            management signs it off.
          </AlertDescription>
        </Alert>
      ) : null}

      {position.status === "draft" ? (
        <Alert>
          <EyeOff />
          <AlertTitle>This is a draft</AlertTitle>
          <AlertDescription>
            Drafts are never shown on the public careers board and cannot receive
            applications. Edit it freely until you are ready to advertise it.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Job description</CardTitle>
            </CardHeader>
            <CardContent>
              {position.description ? (
                <p className="text-sm whitespace-pre-wrap">{position.description}</p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No description yet. Add one before advertising this role.
                </p>
              )}
            </CardContent>
          </Card>

          {position.requirements ? (
            <Card>
              <CardHeader>
                <CardTitle>Requirements</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{position.requirements}</p>
              </CardContent>
            </Card>
          ) : null}

          {rejections.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Why candidates dropped out</CardTitle>
                <CardDescription>
                  {rejectedTotal} rejection{rejectedTotal === 1 ? "" : "s"} on this
                  position, grouped by reason.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {rejections.map((r) => (
                  <div key={r.reason} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm">{r.label}</span>
                    <span
                      className="bg-muted h-2 rounded-full"
                      style={{ width: `${Math.round((r.count / rejectedTotal) * 60) + 4}%` }}
                      aria-hidden
                    />
                    <span className="text-muted-foreground w-8 text-right text-sm tabular-nums">
                      {r.count}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Interview stages</CardTitle>
                  <CardDescription>
                    This sequence belongs to this position alone — changing it
                    affects no other role.
                  </CardDescription>
                </div>
                {canConfigureStages ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/positions/${position.id}/stages`}>
                      <SlidersHorizontal /> Configure
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <StageList stages={activeStages} panels={panels} />
              {archivedCount > 0 ? (
                <p className="text-muted-foreground mt-4 text-xs">
                  {archivedCount} archived stage{archivedCount === 1 ? "" : "s"} kept
                  on the record with their feedback.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {facts.map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-4 border-b pb-2 last:border-0 last:pb-0"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="text-right font-medium">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

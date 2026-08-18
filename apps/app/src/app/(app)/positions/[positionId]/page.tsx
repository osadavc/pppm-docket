import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, EyeOff, Pencil } from "lucide-react";
import { PositionStatusBadge } from "@/components/positions/position-status-badge";
import { StageList } from "@/components/positions/stage-list";
import { SubmitForApprovalButton } from "@/components/positions/submit-for-approval-button";
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
import { getPosition } from "@/lib/queries/positions";

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
        </div>
      </div>

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

          <Card>
            <CardHeader>
              <CardTitle>Interview stages</CardTitle>
              <CardDescription>
                Seeded when this position was created. These stages belong to
                this position alone — changing them affects nothing else.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StageList stages={position.stages} />
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

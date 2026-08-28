import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { z } from "zod";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { ScorecardForm } from "@/components/applications/scorecard-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import {
  canViewApplication,
  getApplicationHeader,
  getApplicationTimeline,
} from "@/lib/queries/activity";
import { getInterviewerScorecardContext } from "@/lib/queries/stage-interviewers";

export const metadata: Metadata = { title: "Application · Docket" };

export default async function ApplicationPage({
  params,
}: PageProps<"/applications/[applicationId]">) {
  const { applicationId } = await params;
  if (!z.uuid().safeParse(applicationId).success) notFound();

  const viewer = await requireUser();

  const header = await getApplicationHeader(applicationId);
  if (!header) notFound();

  // Interviewers reach this page only for applications they are responsible
  // for assessing; the check is against the database, not the referrer.
  if (!(await canViewApplication(viewer, applicationId))) forbidden();

  const [entries, scorecardContext] = await Promise.all([
    getApplicationTimeline(applicationId, viewer),
    viewer.role === "interviewer"
      ? getInterviewerScorecardContext(viewer.id, applicationId)
      : Promise.resolve(null),
  ]);
  const seesEverything = can(viewer.role, "scorecard:read-all");

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {header.candidateName}
        </h1>
        <p className="text-muted-foreground text-sm">
          {can(viewer.role, "position:view") ? (
            <Link href={`/positions/${header.positionId}`} className="hover:underline">
              {header.positionTitle}
            </Link>
          ) : (
            header.positionTitle
          )}{" "}
          · applied {formatDate(header.appliedAt)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-normal">
          {header.currentStageName ?? "No stage"}
        </Badge>
        <Badge variant="secondary" className="font-normal capitalize">
          {header.status.replace("_", " ")}
        </Badge>
      </div>

      {scorecardContext ? <ScorecardForm context={scorecardContext} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>
            Stage changes, interview feedback and email, in one order.
            {seesEverything
              ? null
              : " You see feedback from others once you have submitted your own for that stage."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityTimeline entries={entries} />
        </CardContent>
      </Card>
    </>
  );
}

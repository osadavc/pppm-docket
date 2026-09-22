import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { AdvanceButton } from "@/components/applications/advance-button";
import { EmailsTab } from "@/components/applications/emails-tab";
import { FeedbackList } from "@/components/applications/feedback-list";
import { FlowOverrideMenu } from "@/components/applications/flow-override-menu";
import { GatePanel } from "@/components/applications/gate-panel";
import { HireDialog } from "@/components/applications/hire-dialog";
import { RejectDialog } from "@/components/applications/reject-dialog";
import { ScorecardRevisionViewer } from "@/components/applications/scorecard-revision-viewer";
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
import { getAdvanceContext } from "@/lib/queries/applications";
import { listNotificationsForApplication } from "@/lib/queries/notifications";
import { getFillSummary } from "@/lib/queries/positions";
import { getApplicationScorecardRevisions } from "@/lib/queries/scorecard-revisions";
import { listScorecardsForApplication } from "@/lib/queries/scorecards";

export const metadata: Metadata = { title: "Application · Docket" };

export default async function ApplicationPage({
  params,
}: PageProps<"/applications/[applicationId]">) {
  const viewer = await requireUser();
  const { applicationId } = await params;

  // Interviewers reach this page only for applications they are responsible
  // for assessing right now; authorize before loading the application DTO.
  if (!(await canViewApplication(viewer, applicationId))) forbidden();

  const header = await getApplicationHeader(applicationId);
  if (!header) notFound();

  const canManage = can(viewer.role, "application:manage");
  const canOverrideFlow = can(viewer.role, "application:override-flow");
  const seesEverything = can(viewer.role, "scorecard:read-all");

  const [entries, revisionGroups, feedback, context, emails, fill] =
    await Promise.all([
      getApplicationTimeline(applicationId, viewer),
      getApplicationScorecardRevisions(applicationId, viewer),
      listScorecardsForApplication(applicationId, viewer),
      getAdvanceContext(applicationId),
      listNotificationsForApplication(applicationId, viewer),
      canManage ? getFillSummary(header.positionId) : Promise.resolve(null),
    ]);

  const showActions = context && (canManage || canOverrideFlow);
  const active = header.status === "active";

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {header.candidateName}
        </h1>
        <p className="text-muted-foreground text-sm">
          {can(viewer.role, "position:view") ? (
            <Link
              href={`/positions/${header.positionId}`}
              className="hover:underline"
            >
              {header.positionTitle}
            </Link>
          ) : (
            header.positionTitle
          )}{" "}
          · applied {formatDate(header.appliedAt)}
          {header.createdByName
            ? ` · added by ${header.createdByName}`
            : " · applied via the careers site"}
        </p>
        {seesEverything && header.salaryExpectation ? (
          <p className="text-muted-foreground mt-1 text-sm">
            Salary expectation:{" "}
            <span className="text-foreground">{header.salaryExpectation}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-normal">
          {header.currentStageName ?? "No stage"}
        </Badge>
        <Badge variant="secondary" className="font-normal capitalize">
          {header.status.replace("_", " ")}
        </Badge>
        {showActions ? (
          <div className="ml-auto flex items-center gap-2">
            {canManage ? (
              <AdvanceButton
                context={context}
                canOverride={can(viewer.role, "application:override-gate")}
              />
            ) : null}
            {canManage && fill && active ? (
              <HireDialog context={context} fill={fill} />
            ) : null}
            {canManage && active ? <RejectDialog context={context} /> : null}
            {canOverrideFlow ? <FlowOverrideMenu context={context} /> : null}
          </div>
        ) : null}
      </div>

      {context?.currentStage && (active || header.status === "on_hold") ? (
        <GatePanel
          gate={context.gate}
          stageName={context.currentStage.name}
          outstandingInterviewers={context.outstandingInterviewers}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>
            Stage changes, interview feedback and candidate communication, in
            one order.
            {seesEverything
              ? null
              : " You see feedback from others once you have submitted your own for that stage."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityTimeline entries={entries} />
        </CardContent>
      </Card>

      <FeedbackList
        feedback={feedback}
        applicationId={applicationId}
        viewerId={viewer.id}
        editable={header.status === "active" || header.status === "on_hold"}
      />

      <ScorecardRevisionViewer groups={revisionGroups} />

      {can(viewer.role, "application:view") ? (
        <EmailsTab
          applicationId={applicationId}
          candidateName={header.candidateName}
          candidateEmail={header.candidateEmail}
          positionTitle={header.positionTitle}
          emails={emails}
          canSend={canManage}
        />
      ) : null}
    </>
  );
}

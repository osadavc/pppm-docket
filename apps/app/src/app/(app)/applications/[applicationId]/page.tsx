import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ClipboardPen, Download, ExternalLink, UserX } from "lucide-react";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { ClickToCopy } from "@/components/app/click-to-copy";
import { AdvanceButton } from "@/components/applications/advance-button";
import {
  ApplicationTabs,
  parseTab,
  type ApplicationTab,
} from "@/components/applications/application-tabs";
import { EmailsTab } from "@/components/applications/emails-tab";
import { FeedbackList } from "@/components/applications/feedback-list";
import { FlowOverrideMenu } from "@/components/applications/flow-override-menu";
import { GatePanel } from "@/components/applications/gate-panel";
import { InterviewsPanel } from "@/components/applications/interviews-panel";
import { HireDialog } from "@/components/applications/hire-dialog";
import { RejectDialog } from "@/components/applications/reject-dialog";
import { ScorecardRevisionViewer } from "@/components/applications/scorecard-revision-viewer";
import { StageStepper } from "@/components/applications/stage-stepper";
import { PaceBadge } from "@/components/pipeline/pace-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { paceFor } from "@/lib/domain/pace";
import { formatDate } from "@/lib/format";
import {
  canViewApplication,
  getApplicationHeader,
  getApplicationStepper,
  getApplicationTimeline,
  type ApplicationHeader,
} from "@/lib/queries/activity";
import { getAdvanceContext } from "@/lib/queries/applications";
import {
  countNotificationsForApplication,
  listNotificationsForApplication,
} from "@/lib/queries/notifications";
import { getFeedbackContext } from "@/lib/queries/feedback";
import { getCurrentStageForScheduling, listInterviewsForApplication } from "@/lib/queries/interviews";
import { listAssignableInterviewers } from "@/lib/queries/stage-interviewers";
import { getFillSummary } from "@/lib/queries/positions";
import { getApplicationScorecardRevisions } from "@/lib/queries/scorecard-revisions";
import { listScorecardsForApplication } from "@/lib/queries/scorecards";
import { REJECTION_REASON_LABELS } from "@/lib/validation/application";
import { CANDIDATE_SOURCE_LABELS } from "@/lib/validation/candidate";
import { APPLICATION_STATUS_LABELS } from "@/lib/validation/candidate-search";
import { parseUuidParam } from "@/lib/validation/params";

export const metadata: Metadata = { title: "Application · Docket" };

function DetailsTab({
  header,
  seesEverything,
}: {
  header: ApplicationHeader;
  seesEverything: boolean;
}) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Email", <ClickToCopy key="email" value={header.candidateEmail} label="Email" />],
    [
      "Phone",
      header.candidatePhone ? (
        <ClickToCopy value={header.candidatePhone} label="Phone" />
      ) : (
        "-"
      ),
    ],
    ["Location", header.candidateLocation || "-"],
    ["Current title", header.currentTitle || "-"],
    ["Company", header.currentCompany || "-"],
    [
      "Source",
      CANDIDATE_SOURCE_LABELS[header.source as keyof typeof CANDIDATE_SOURCE_LABELS] ??
        header.source,
    ],
    ["Applied", formatDate(header.appliedAt)],
    [
      "Salary expectation",
      seesEverything ? header.salaryExpectation || "-" : (
        <span className="text-muted-foreground">Restricted</span>
      ),
    ],
    ["Resolved", header.decisionAt ? formatDate(header.decisionAt) : "-"],
    [
      "Added by",
      header.createdByName ?? "Candidate via careers site",
    ],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0">{value}</dd>
            </div>
          ))}
          <dt className="text-muted-foreground">CV</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {header.cv ? (
              <>
                <span className="truncate">{header.cv.fileName}</span>
                {header.cv.mimeType === "application/pdf" ? (
                  <Button asChild size="xs" variant="outline">
                    <a href={`/api/files/${header.cv.attachmentId}?inline=1`} target="_blank" rel="noreferrer">
                      <ExternalLink /> Open
                    </a>
                  </Button>
                ) : null}
                <Button asChild size="xs" variant="outline">
                  <a href={`/api/files/${header.cv.attachmentId}`}>
                    <Download /> Download
                  </a>
                </Button>
              </>
            ) : (
              <span className="text-muted-foreground">No CV attached</span>
            )}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}

export default async function ApplicationPage({
  params,
  searchParams,
}: PageProps<"/applications/[applicationId]">) {
  const viewer = await requireUser();
  const applicationId = parseUuidParam((await params).applicationId);
  const { tab } = await searchParams;

  // Interviewers reach this page only for applications they are responsible
  // for assessing right now; authorize before loading the application DTO.
  if (!(await canViewApplication(viewer, applicationId))) forbidden();

  const header = await getApplicationHeader(applicationId);
  if (!header) notFound();

  const isStaff = can(viewer.role, "application:view");
  const canManage = can(viewer.role, "application:manage");
  const canOverrideFlow = can(viewer.role, "application:override-flow");
  const seesEverything = can(viewer.role, "scorecard:read-all");

  const tabs: Array<{ id: ApplicationTab; label: string }> = [
    { id: "feed", label: "Feed" },
    { id: "feedback", label: "Feedback" },
    ...(isStaff ? [{ id: "emails" as const, label: "Emails" }] : []),
    { id: "details", label: "Details" },
  ];
  const current = parseTab(
    tab,
    isStaff ? "feed" : "feedback",
    tabs.map((t) => t.id),
  );

  const [entries, revisionGroups, feedback, context, emails, fill, stepper, emailCount] =
    await Promise.all([
      current === "feed" ? getApplicationTimeline(applicationId, viewer) : [],
      current === "feedback" ? getApplicationScorecardRevisions(applicationId, viewer) : [],
      current === "feedback" ? listScorecardsForApplication(applicationId, viewer) : null,
      canManage || canOverrideFlow ? getAdvanceContext(applicationId) : null,
      current === "emails" && isStaff
        ? listNotificationsForApplication(applicationId, viewer)
        : [],
      canManage ? getFillSummary(header.positionId) : null,
      getApplicationStepper(applicationId),
      isStaff ? countNotificationsForApplication(applicationId, viewer) : 0,
    ]);

  const [interviewList, schedulingStage, people, myFeedback] = await Promise.all([
    listInterviewsForApplication(applicationId),
    getCurrentStageForScheduling(applicationId),
    canManage ? listAssignableInterviewers() : [],
    getFeedbackContext(viewer.id, applicationId),
  ]);
  const onAnInterview = interviewList.some((i) => i.participants.some((p) => p.userId === viewer.id));
  const feedbackHref = myFeedback ? `/applications/${applicationId}/feedback` : null;

  const active = header.status === "active";
  const tabsWithCounts = tabs.map((t) =>
    t.id === "emails" ? { ...t, label: `Emails (${emailCount})` } : t,
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {header.candidateName}
          </h1>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <ClickToCopy value={header.candidateEmail} label="Email" />
            {header.candidatePhone ? (
              <ClickToCopy value={header.candidatePhone} label="Phone" />
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {can(viewer.role, "position:view") ? (
              <Link href={`/positions/${header.positionId}`} className="hover:underline">
                {header.positionTitle}
              </Link>
            ) : (
              header.positionTitle
            )}{" "}
            · applied {formatDate(header.appliedAt)}
            {header.createdByName ? ` · added by ${header.createdByName}` : " · via the careers site"}
          </p>
        </div>

        {context && (canManage || canOverrideFlow) ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* HR: Hire replaces Advance at the final stage. */}
            {canManage && active && context.isFinalStage && fill ? (
              <HireDialog context={context} fill={fill} />
            ) : canManage ? (
              <AdvanceButton
                context={context}
                canOverride={can(viewer.role, "application:override-gate")}
                people={people.map((p) => ({ id: p.userId, name: p.name, jobTitle: p.jobTitle }))}
              />
            ) : null}
            {canManage && active ? <RejectDialog context={context} /> : null}
            {canOverrideFlow ? <FlowOverrideMenu context={context} /> : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="font-normal">
          {APPLICATION_STATUS_LABELS[header.status as keyof typeof APPLICATION_STATUS_LABELS] ?? header.status}
        </Badge>
        {active && header.enteredAt ? <PaceBadge pace={paceFor(header.enteredAt)} /> : null}
      </div>

      <StageStepper stages={stepper} />

      {header.status === "rejected" ? (
        <Alert variant="destructive">
          <UserX />
          <AlertTitle>
            Rejected
            {header.rejectionReason
              ? ` · ${REJECTION_REASON_LABELS[header.rejectionReason as keyof typeof REJECTION_REASON_LABELS] ?? header.rejectionReason}`
              : ""}
          </AlertTitle>
          {seesEverything && header.decisionReason ? (
            <AlertDescription>{header.decisionReason}</AlertDescription>
          ) : null}
        </Alert>
      ) : null}

      {myFeedback ? (
        <Alert>
          <ClipboardPen />
          <AlertTitle>
            {myFeedback.scorecard?.status === "submitted"
              ? `You submitted feedback for ${myFeedback.stageName}`
              : `Your feedback is needed for ${myFeedback.stageName}`}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {myFeedback.scorecard?.status === "submitted"
                ? "You can still revise it while the candidate is at this stage."
                : myFeedback.scorecard?.status === "draft"
                  ? "You have a draft saved. Finish it whenever you are ready."
                  : "Submit your scorecard once you have spoken with the candidate."}
            </span>
            <Button asChild size="sm">
              <Link href={feedbackHref!}>
                {myFeedback.scorecard?.status === "submitted" ? "Edit feedback" : myFeedback.scorecard ? "Continue feedback" : "Submit feedback"}
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {context?.currentStage && (active || header.status === "on_hold") ? (
        <GatePanel
          gate={context.gate}
          stageName={context.currentStage.name}
          outstandingInterviewers={context.outstandingInterviewers}
        />
      ) : null}

      {(isStaff && (active || interviewList.length > 0)) || onAnInterview ? (
        <InterviewsPanel
          applicationId={applicationId}
          stageName={active ? (schedulingStage?.stageName ?? null) : null}
          applicationStageId={schedulingStage?.applicationStageId ?? null}
          interviews={interviewList}
          people={people.map((p) => ({ id: p.userId, name: p.name, jobTitle: p.jobTitle }))}
          standingPanelIds={schedulingStage?.standingPanelIds ?? []}
          canManage={canManage && active}
          viewerId={viewer.id}
          feedbackHref={feedbackHref}
        />
      ) : null}

      <ApplicationTabs applicationId={applicationId} tabs={tabsWithCounts} current={current} />

      {current === "feed" ? (
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
      ) : null}

      {current === "feedback" && feedback ? (
        <>
          <FeedbackList
            feedback={feedback}
            applicationId={applicationId}
            viewerId={viewer.id}
            editable={active || header.status === "on_hold"}
          />
          <ScorecardRevisionViewer groups={revisionGroups} />
        </>
      ) : null}

      {current === "emails" && isStaff ? (
        <EmailsTab
          applicationId={applicationId}
          candidateName={header.candidateName}
          candidateEmail={header.candidateEmail}
          positionTitle={header.positionTitle}
          emails={emails}
          canSend={canManage}
        />
      ) : null}

      {current === "details" ? (
        <DetailsTab header={header} seesEverything={seesEverything} />
      ) : null}
    </>
  );
}

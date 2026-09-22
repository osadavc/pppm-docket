import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { forbidden, notFound } from "next/navigation";
import { z } from "zod";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { FeedbackForm } from "@/components/applications/feedback-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guards";
import { getApplicationTimeline } from "@/lib/queries/activity";
import {
  getFeedbackContext,
  getScorecardEditContext,
} from "@/lib/queries/feedback";
import { parseUuidParam } from "@/lib/validation/params";
import { applicationExists } from "@/lib/queries/activity";

export const metadata: Metadata = { title: "Feedback · Docket" };

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ scorecard?: string }>;
}) {
  const viewer = await requireUser();
  const applicationId = parseUuidParam((await params).applicationId);
  const { scorecard: scorecardId } = await searchParams;
  // A link to an application that does not exist is "not found"; one that
  // exists but is not this viewer's to assess is "forbidden".
  if (!(await applicationExists(applicationId))) notFound();

  const context = scorecardId
    ? z.uuid().safeParse(scorecardId).success
      ? await getScorecardEditContext(viewer, applicationId, scorecardId)
      : null
    : await getFeedbackContext(viewer.id, applicationId);
  if (!context) forbidden();
  const submitted = context.scorecard?.status === "submitted";
  const timeline = submitted
    ? await getApplicationTimeline(applicationId, viewer)
    : [];

  return (
    <>
      <div>
        <Link
          href="/queue"
          className="text-muted-foreground mb-2 inline-flex items-center gap-1 text-sm hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-3.5" /> Back to my queue
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Your feedback: {context.stageName}
            </h1>
            <p className="text-muted-foreground text-sm">
              {context.candidateName} · {context.positionTitle}
            </p>
          </div>
          <Badge variant={submitted ? "outline" : "secondary"}>
            {submitted ? "Submitted" : "Feedback due"}
          </Badge>
        </div>
        {context.stageDescription ? (
          <p className="text-muted-foreground mt-3 max-w-3xl text-sm">
            {context.stageDescription}
          </p>
        ) : null}
      </div>

      {submitted ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Edit your feedback</CardTitle>
              <CardDescription>
                Your original submission remains in the audit history. Saving
                changes creates a new revision without changing the feedback
                gate.
              </CardDescription>
            </CardHeader>
          </Card>

          <FeedbackForm context={context} />

          <Card>
            <CardHeader>
              <CardTitle>Application history</CardTitle>
              <CardDescription>
                Stage activity and feedback you are authorized to view.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={timeline} />
            </CardContent>
          </Card>
        </>
      ) : (
        <FeedbackForm context={context} />
      )}
    </>
  );
}

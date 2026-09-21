import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { forbidden, notFound } from "next/navigation";
import { z } from "zod";
import { FeedbackForm } from "@/components/applications/feedback-form";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/guards";
import { getFeedbackContext } from "@/lib/queries/feedback";

export const metadata: Metadata = { title: "Feedback · Docket" };

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const viewer = await requireUser();
  const { applicationId } = await params;
  if (!z.uuid().safeParse(applicationId).success) notFound();

  const context = await getFeedbackContext(viewer.id, applicationId);
  if (!context) forbidden();

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
              Feedback for {context.candidateName}
            </h1>
            <p className="text-muted-foreground text-sm">
              {context.positionTitle} · {context.stageName}
            </p>
          </div>
          <Badge
            variant={
              context.scorecard?.status === "submitted"
                ? "outline"
                : "secondary"
            }
          >
            {context.scorecard?.status === "submitted"
              ? "Feedback submitted"
              : context.scorecard
                ? "Draft"
                : "Not started"}
          </Badge>
        </div>
        {context.stageDescription ? (
          <p className="text-muted-foreground mt-3 max-w-3xl text-sm">
            {context.stageDescription}
          </p>
        ) : null}
      </div>

      <FeedbackForm context={context} />
    </>
  );
}

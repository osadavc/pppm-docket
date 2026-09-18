import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Download,
  Eye,
  MessageSquareText,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaceBadge } from "@/components/pipeline/pace-badge";
import { requireUser } from "@/lib/auth/guards";
import {
  listAssignedActiveCandidates,
  type AssignedCandidate,
} from "@/lib/queries/stage-interviewers";

export const metadata: Metadata = { title: "My agenda · Docket" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function FeedbackState({ candidate }: { candidate: AssignedCandidate }) {
  if (candidate.feedbackStatus === "submitted") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      >
        <CheckCircle2 data-icon="inline-start" /> Feedback submitted
      </Badge>
    );
  }

  return (
    <Badge variant="secondary">
      <CircleDashed data-icon="inline-start" />
      Awaiting feedback
    </Badge>
  );
}

export default async function AgendaPage() {
  const viewer = await requireUser("/agenda");
  const queue = await listAssignedActiveCandidates(viewer.id);
  const candidateCount = queue.reduce(
    (total, stage) => total + stage.candidates.length,
    0,
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My agenda</h1>
          <p className="text-muted-foreground text-sm">
            Active candidates at the stages assigned to you.
          </p>
        </div>
        {candidateCount > 0 ? (
          <p className="text-muted-foreground text-sm tabular-nums">
            <span className="text-foreground font-medium">
              {candidateCount}
            </span>{" "}
            {candidateCount === 1 ? "candidate" : "candidates"} across{" "}
            <span className="text-foreground font-medium">{queue.length}</span>{" "}
            {queue.length === 1 ? "stage" : "stages"}
          </p>
        ) : null}
      </div>

      {queue.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <ClipboardCheck className="text-muted-foreground size-8" />
          <p className="text-sm font-medium">Your queue is clear</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Active candidates will appear here when they reach one of your
            assigned stages.
          </p>
        </Card>
      ) : (
        <div className="grid items-start gap-4">
          {queue.map((stage) => (
            <Card key={stage.key} className="gap-0 py-0">
              <CardHeader className="border-b bg-muted/35 py-4">
                <div className="min-w-0">
                  <p className="text-muted-foreground truncate text-xs font-medium tracking-wide uppercase">
                    {stage.positionTitle}
                  </p>
                  <CardTitle className="mt-0.5 flex items-center gap-2">
                    <span className="truncate">{stage.stageName}</span>
                    <Badge variant="secondary" className="tabular-nums">
                      {stage.candidates.length}
                    </Badge>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-0">
                <div className="text-muted-foreground hidden grid-cols-[minmax(0,1fr)_8rem_11rem_16rem] gap-3 border-b px-4 py-2 text-xs font-medium md:grid">
                  <span>Candidate</span>
                  <span>Time in stage</span>
                  <span>Feedback</span>
                  <span>Open</span>
                </div>
                <div className="divide-y">
                  {stage.candidates.map((candidate) => (
                    <div
                      key={candidate.applicationId}
                      className="group flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 md:grid md:grid-cols-[minmax(0,1fr)_8rem_11rem_16rem] md:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarFallback className="font-medium">
                            {initials(candidate.candidateName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/applications/${candidate.applicationId}`}
                            className="truncate font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {candidate.candidateName}
                          </Link>
                          <p className="text-muted-foreground truncate text-xs">
                            {candidate.candidateTitle ?? "Candidate"}
                          </p>
                          <p className="text-muted-foreground mt-0.5 truncate text-xs md:hidden">
                            {candidate.positionTitle} · {candidate.stageName}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 md:hidden">
                            <PaceBadge pace={candidate.pace} />
                            <FeedbackState candidate={candidate} />
                          </div>
                        </div>
                      </div>
                      <div className="hidden md:block">
                        <PaceBadge pace={candidate.pace} />
                      </div>
                      <div className="hidden md:block">
                        <FeedbackState candidate={candidate} />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                        <Button asChild size="sm" variant="ghost">
                          <Link
                            href={`/applications/${candidate.applicationId}`}
                          >
                            <Eye /> Application
                          </Link>
                        </Button>
                        {candidate.cvAttachmentId ? (
                          <Button asChild size="sm" variant="ghost">
                            <a href={`/api/files/${candidate.cvAttachmentId}`}>
                              <Download /> CV
                            </a>
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled>
                            <Download /> No CV
                          </Button>
                        )}
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/applications/${candidate.applicationId}/feedback`}
                          >
                            <MessageSquareText /> Feedback
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

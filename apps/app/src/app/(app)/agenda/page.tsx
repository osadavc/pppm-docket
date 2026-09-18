import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  FilePenLine,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  if (candidate.feedbackStatus === "draft") {
    return (
      <Badge variant="secondary">
        <FilePenLine data-icon="inline-start" /> Draft saved
      </Badge>
    );
  }

  return (
    <Badge variant={candidate.requiresScorecard ? "default" : "outline"}>
      <CircleDashed data-icon="inline-start" />
      {candidate.requiresScorecard ? "Feedback needed" : "Ready to review"}
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
            <span className="text-foreground font-medium">{candidateCount}</span>{" "}
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
        <div className="grid items-start gap-4 xl:grid-cols-2">
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
              <CardContent className="divide-y px-0">
                {stage.candidates.map((candidate) => (
                  <Link
                    key={candidate.applicationId}
                    href={`/applications/${candidate.applicationId}`}
                    className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <Avatar className="size-9">
                      <AvatarFallback className="font-medium">
                        {initials(candidate.candidateName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {candidate.candidateName}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {candidate.candidateTitle ?? "Candidate"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
                        <PaceBadge pace={candidate.pace} />
                        <FeedbackState candidate={candidate} />
                      </div>
                    </div>
                    <div className="hidden items-center gap-2 sm:flex">
                      <PaceBadge pace={candidate.pace} />
                      <FeedbackState candidate={candidate} />
                    </div>
                    <ArrowRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                    <span className="sr-only">Open application</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  MessageSquareText,
} from "lucide-react";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PaceBadge } from "@/components/pipeline/pace-badge";
import { requirePermission } from "@/lib/auth/guards";
import { GATE_EXPLANATIONS } from "@/lib/domain/advancement";
import {
  getMyQueue,
  type MyQueuePage,
  type QueueCandidate,
} from "@/lib/queries/queue";

export const metadata: Metadata = { title: "My queue · Docket" };

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function FeedbackBadge({
  status,
}: {
  status: QueueCandidate["feedbackStatus"];
}) {
  return status === "submitted" ? (
    <Badge variant="outline">
      <CheckCircle2 data-icon="inline-start" />
      Submitted
    </Badge>
  ) : (
    <Badge variant="secondary">Feedback due</Badge>
  );
}

function GateBadge({ candidate }: { candidate: QueueCandidate }) {
  const label = candidate.gate.blocked
    ? `Gate blocked · ${candidate.gate.outstanding} needed`
    : "Gate clear";

  return (
    <Badge
      variant={candidate.gate.blocked ? "destructive" : "outline"}
      title={GATE_EXPLANATIONS[candidate.gate.reason]}
    >
      {label}
    </Badge>
  );
}

function QueueRow({ candidate }: { candidate: QueueCandidate }) {
  const applicationHref = `/applications/${candidate.applicationId}`;
  const feedbackHref = `/applications/${candidate.applicationId}/feedback`;

  return (
    <li className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.25fr)_minmax(10rem,0.9fr)_auto_auto] md:items-center">
      <div className="min-w-0">
        <Link
          href={applicationHref}
          prefetch={false}
          className="truncate font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {candidate.candidateName}
        </Link>
        <p className="text-muted-foreground truncate text-xs">
          {candidate.candidateTitle ?? "Candidate"}
        </p>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm">{candidate.positionTitle}</p>
        <p className="text-muted-foreground truncate text-xs">
          {candidate.stageName}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PaceBadge pace={candidate.pace} />
        <FeedbackBadge status={candidate.feedbackStatus} />
        <GateBadge candidate={candidate} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
        {candidate.cvAttachmentId ? (
          <Button asChild size="sm" variant="ghost">
            <a href={`/api/files/${candidate.cvAttachmentId}`}>
              <Download data-icon="inline-start" />
              CV
            </a>
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled>
            <Download data-icon="inline-start" />
            No CV
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href={feedbackHref} prefetch={false}>
            <MessageSquareText data-icon="inline-start" />
            Open feedback
          </Link>
        </Button>
      </div>
    </li>
  );
}

function QueueSection({
  title,
  description,
  total,
  candidates,
  emptyCopy,
}: {
  title: string;
  description: string;
  total: number;
  candidates: QueueCandidate[];
  emptyCopy: string;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Badge variant="secondary" className="tabular-nums">
            {total}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        {candidates.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            {emptyCopy}
          </p>
        ) : (
          <ul className="divide-y">
            {candidates.map((candidate) => (
              <QueueRow
                key={candidate.applicationStageId}
                candidate={candidate}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function QueuePagination({ queue }: { queue: MyQueuePage }) {
  const { page, pageSize, totalPages } = queue.pagination;
  if (totalPages <= 1) return null;

  const rowsOnPage = queue.awaiting.length + queue.submitted.length;
  const first = (page - 1) * pageSize + 1;
  const last = first + rowsOnPage - 1;

  return (
    <nav
      aria-label="Queue pages"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-muted-foreground text-sm tabular-nums">
        Showing {first}–{last} of {queue.summary.total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/queue?page=${page - 1}`}>Previous</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        <span className="text-muted-foreground text-sm tabular-nums">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/queue?page=${page + 1}`}>Next</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </nav>
  );
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const viewer = await requirePermission("queue:view");
  const { page: pageParam } = await searchParams;
  const queue = await getMyQueue(viewer.id, parsePage(pageParam));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My queue</h1>
          <p className="text-muted-foreground text-sm">
            Active candidates currently at stages assigned to you.
          </p>
        </div>
        <p className="text-muted-foreground text-sm tabular-nums">
          <span className="text-foreground text-2xl font-semibold">
            {queue.summary.awaiting}
          </span>{" "}
          {queue.summary.awaiting === 1
            ? "candidate awaits"
            : "candidates await"}{" "}
          your feedback
        </p>
      </div>

      {queue.summary.total === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardCheck />
            </EmptyMedia>
            <EmptyTitle>Your queue is clear</EmptyTitle>
            <EmptyDescription>
              Active candidates appear here when they reach a stage where you
              are on the interview panel.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <QueueSection
            title="Awaiting your feedback"
            description="Your scorecard is still due. The gate badge shows whether the hiring process is actually blocked."
            total={queue.summary.awaiting}
            candidates={queue.awaiting}
            emptyCopy="No awaiting candidates appear on this page."
          />
          <QueueSection
            title="Submitted — in your stage"
            description="You have submitted feedback, and the candidate remains at this assigned stage."
            total={queue.summary.submitted}
            candidates={queue.submitted}
            emptyCopy="No submitted candidates appear on this page."
          />
          <QueuePagination queue={queue} />
        </div>
      )}
    </>
  );
}

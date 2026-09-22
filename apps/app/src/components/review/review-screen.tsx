"use client";

import { ChevronLeft, ChevronRight, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdvanceButton } from "@/components/applications/advance-button";
import { RejectDialog } from "@/components/applications/reject-dialog";
import { GatePanel } from "@/components/applications/gate-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { ReviewCard, ReviewQueue } from "@/lib/queries/pipeline";
import type { AdvanceContext } from "@/lib/queries/applications";

function toAdvanceContext(queue: ReviewQueue, card: ReviewCard): AdvanceContext {
  return {
    applicationId: card.applicationId,
    candidateId: card.candidateId,
    candidateName: card.candidateName,
    candidateEmail: card.candidateEmail,
    positionId: queue.position.id,
    positionTitle: queue.position.title,
    status: "active",
    currentStage: queue.stage,
    nextStage: queue.nextStage,
    gate: card.gate,
    outstandingInterviewers: card.outstandingInterviewers,
    isFinalStage: queue.stage !== null && queue.nextStage === null,
  };
}

function CvPane({ card }: { card: ReviewCard }) {
  if (!card.cv) {
    return (
      <div className="text-muted-foreground flex h-full min-h-96 items-center justify-center rounded-lg border border-dashed text-sm">
        No CV attached
      </div>
    );
  }
  const inlineHref = `/api/files/${card.cv.attachmentId}?inline=1`;
  if (card.cv.mimeType === "application/pdf") {
    return (
      <iframe
        key={card.cv.attachmentId}
        title={`CV — ${card.candidateName}`}
        src={inlineHref}
        className="bg-background h-[75vh] min-h-96 w-full rounded-lg border"
      />
    );
  }
  return (
    <div className="flex h-full min-h-96 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-sm">
      <p className="text-muted-foreground">
        {card.cv.fileName} is a Word document and cannot be previewed here.
      </p>
      <Button asChild size="sm" variant="outline">
        <a href={`/api/files/${card.cv.attachmentId}`}>
          <Download /> Download CV
        </a>
      </Button>
    </div>
  );
}

/**
 * Screen the first stage one candidate at a time: CV on the left, decision on
 * the right. The loaded cards are a bounded page; `total` is the true count,
 * so the counter stays honest however many were loaded. Decisions go through
 * the same dialogs and server actions as everywhere else — the keyboard only
 * opens them, it never bypasses the gate or the reason.
 */
export function ReviewScreen({
  queue,
  canDecide,
  canOverride,
}: {
  queue: ReviewQueue;
  /** HR only. Management may inspect and navigate. */
  canDecide: boolean;
  canOverride: boolean;
}) {
  const router = useRouter();
  const [cards, setCards] = useState(queue.cards);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const remaining = Math.max(0, queue.total - reviewed);
  const card = cards[index] ?? null;

  const go = useCallback(
    (delta: number) =>
      setIndex((i) => Math.min(Math.max(0, i + delta), Math.max(0, cards.length - 1))),
    [cards.length],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable ||
          target.closest("[role=dialog]"))
      ) {
        return;
      }
      if (event.key === "j" || event.key === "ArrowRight") go(1);
      else if (event.key === "k" || event.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go]);

  function done() {
    if (!card) return;
    setCards((current) => current.filter((c) => c.applicationId !== card.applicationId));
    setReviewed((n) => n + 1);
    setIndex((i) => Math.min(i, Math.max(0, cards.length - 2)));
    // The server queue is the source of truth; refetch it so the next page of
    // cards and the true total follow the decision that just committed.
    router.refresh();
  }

  if (!queue.stage) {
    return (
      <Card className="text-muted-foreground p-10 text-center text-sm">
        This position has no live stages to review.
      </Card>
    );
  }

  if (!card) {
    return (
      <Card className="p-10 text-center">
        <p className="font-medium">
          Queue clear — every application at {queue.stage.name} has been reviewed.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {reviewed} reviewed this session
          {remaining > 0 ? ` · ${remaining} more loaded on refresh` : ""}.
        </p>
        {remaining > 0 ? (
          <Button className="mt-4" variant="outline" onClick={() => router.refresh()}>
            Load next batch
          </Button>
        ) : null}
      </Card>
    );
  }

  const context = toAdvanceContext(queue, card);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)]">
      <CvPane card={card} />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm tabular-nums">
            {index + 1} of {cards.length} loaded · {remaining} at {queue.stage.name} ·{" "}
            {reviewed} reviewed
          </p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Previous (K)" disabled={index === 0} onClick={() => go(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Next (J)" disabled={index >= cards.length - 1} onClick={() => go(1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {card.candidateName}
              {card.currentTitle ? (
                <Badge variant="secondary" className="font-normal">{card.currentTitle}</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{card.candidateEmail}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{card.candidatePhone || "—"}</dd>
              <dt className="text-muted-foreground">Applied</dt>
              <dd>{formatDate(card.appliedAt)}</dd>
              {card.salaryExpectation ? (
                <>
                  <dt className="text-muted-foreground">Salary expectation</dt>
                  <dd>{card.salaryExpectation}</dd>
                </>
              ) : null}
            </dl>
            <Link
              href={`/applications/${card.applicationId}`}
              className="inline-flex items-center gap-1 underline underline-offset-4"
            >
              Full record <ExternalLink className="size-3.5" />
            </Link>
          </CardContent>
        </Card>

        <GatePanel
          gate={card.gate}
          stageName={queue.stage.name}
          outstandingInterviewers={card.outstandingInterviewers}
        />

        {canDecide ? (
          <div className="flex flex-wrap items-center gap-2">
            <AdvanceButton
              key={`advance-${card.applicationId}`}
              context={context}
              canOverride={canOverride}
              shortcutKey="a"
              onDone={done}
            />
            <RejectDialog
              key={`reject-${card.applicationId}`}
              context={context}
              shortcutKey="r"
              onDone={done}
            />
            <p className="text-muted-foreground text-xs">
              <kbd>A</kbd> advance · <kbd>R</kbd> reject · <kbd>J</kbd>/<kbd>K</kbd> next/previous
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            Decisions at this stage are HR&apos;s. <kbd>J</kbd>/<kbd>K</kbd> move between candidates.
          </p>
        )}
      </div>
    </div>
  );
}

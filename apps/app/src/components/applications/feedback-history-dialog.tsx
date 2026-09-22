"use client";

import { diffWordsWithSpace } from "diff";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/format";
import type { ScorecardRevisionView } from "@/lib/queries/scorecard-revisions";
import { RECOMMENDATION_LABELS } from "@/lib/validation/scorecard";

function recommendationLabel(value: ScorecardRevisionView["recommendation"]) {
  return value ? RECOMMENDATION_LABELS[value] : "-";
}

function scoreLabel(value: string | null) {
  return value ? `${Number(value).toFixed(2)} / 5` : "-";
}

function ValueDelta({ before, after }: { before: string; after: string }) {
  if (before === after) return <span>{after}</span>;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <del className="text-destructive">{before}</del>
      <span className="text-positive font-medium">{after}</span>
    </span>
  );
}

function NarrativeDiff({
  before,
  after,
}: {
  before: string | null;
  after: string | null;
}) {
  const original = before ?? "";
  const updated = after ?? "";
  if (original === updated) {
    return (
      <p className="text-muted-foreground whitespace-pre-wrap">
        {updated || "-"}
      </p>
    );
  }

  return (
    <p className="whitespace-pre-wrap">
      {diffWordsWithSpace(original, updated).map((part, index) => (
        <span
          key={`${part.value}-${index}`}
          className={
            part.added
              ? "bg-positive/10 text-positive"
              : part.removed
                ? "bg-destructive/10 text-destructive line-through"
                : undefined
          }
        >
          {part.value}
        </span>
      ))}
    </p>
  );
}

function RevisionDiff({
  revision,
  previous,
}: {
  revision: ScorecardRevisionView;
  previous: ScorecardRevisionView | undefined;
}) {
  return (
    <article className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={previous ? "outline" : "secondary"}>
            {revision.revisionNumber === 1
              ? "Original submission"
              : `Revision ${revision.revisionNumber}`}
          </Badge>
          {revision.revisionNumber > 1 ? (
            <Badge variant="secondary">Edited</Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {revision.authorName} · {formatDateTime(revision.createdAt)}
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-xs font-medium uppercase">
            Recommendation
          </dt>
          <dd>
            <ValueDelta
              before={recommendationLabel(previous?.recommendation ?? null)}
              after={recommendationLabel(revision.recommendation)}
            />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-xs font-medium uppercase">
            Weighted score
          </dt>
          <dd>
            <ValueDelta
              before={scoreLabel(previous?.overallScore ?? null)}
              after={scoreLabel(revision.overallScore)}
            />
          </dd>
        </div>
      </dl>

      <dl className="flex flex-col gap-4">
        {(
          [
            ["Strengths", previous?.strengths, revision.strengths],
            ["Concerns", previous?.concerns, revision.concerns],
            ["Notes", previous?.notes, revision.notes],
          ] as const
        ).map(([label, before, after]) => (
          <div key={label} className="flex flex-col gap-1.5">
            <dt className="font-medium">{label}</dt>
            <dd>
              <NarrativeDiff before={before ?? null} after={after ?? null} />
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function FeedbackHistoryDialog({
  authorName,
  stageName,
  revisions,
}: {
  authorName: string;
  stageName: string;
  revisions: ScorecardRevisionView[];
}) {
  const newestFirst = [...revisions].reverse();
  const edits = Math.max(0, revisions.length - 1);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <History data-icon="inline-start" />
          {edits > 0 ? `Edited ×${edits}` : "Edit history"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl p-0 sm:max-w-3xl">
        <DialogHeader className="px-4 pt-4 pr-12">
          <DialogTitle>Edit history</DialogTitle>
          <DialogDescription>
            {authorName} · {stageName}. Latest revision first; changes are
            compared with the revision immediately before it.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          <div className="flex flex-col gap-5 px-4 pb-4">
            {newestFirst.map((revision) => (
              <div key={revision.id} className="flex flex-col gap-5">
                <RevisionDiff
                  revision={revision}
                  previous={revisions.find(
                    (candidate) =>
                      candidate.revisionNumber === revision.revisionNumber - 1,
                  )}
                />
                {revision.revisionNumber > 1 ? <Separator /> : null}
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

import { ChevronDown, History } from "lucide-react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type {
  ScorecardRevisionGroup,
  ScorecardRevisionView,
} from "@/lib/queries/scorecard-revisions";
import { RECOMMENDATION_LABELS } from "@/lib/validation/scorecard";

function narrative(value: string | null) {
  return value?.trim() || "Not provided";
}

function score(value: string | null) {
  if (!value) return "Not rated";
  return `${Number(value).toFixed(2)} / 5`;
}

function RevisionSnapshot({
  revision,
  isLatest,
}: {
  revision: ScorecardRevisionView;
  isLatest: boolean;
}) {
  return (
    <Collapsible defaultOpen={isLatest}>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Badge variant={isLatest ? "default" : "outline"}>
              {revision.revisionNumber === 1
                ? "Original submission"
                : `Revision ${revision.revisionNumber}`}
            </Badge>
            {isLatest ? <Badge variant="secondary">Latest</Badge> : null}
          </CardTitle>
          <CardDescription>
            {revision.authorName} · {formatDateTime(revision.createdAt)}
          </CardDescription>
          <CardAction>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${isLatest ? "Hide" : "Show"} revision ${revision.revisionNumber}`}
              >
                <ChevronDown className="transition-transform group-data-[state=open]/button:rotate-180" />
              </Button>
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="flex flex-col gap-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground text-xs font-medium uppercase">
                  Recommendation
                </dt>
                <dd className="font-medium">
                  {revision.recommendation
                    ? RECOMMENDATION_LABELS[revision.recommendation]
                    : "Not provided"}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground text-xs font-medium uppercase">
                  Weighted score
                </dt>
                <dd className="font-medium">{score(revision.overallScore)}</dd>
              </div>
            </dl>

            <Separator />

            <dl className="grid gap-5 lg:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <dt className="font-medium">Strengths</dt>
                <dd className="text-muted-foreground whitespace-pre-wrap">
                  {narrative(revision.strengths)}
                </dd>
              </div>
              <div className="flex flex-col gap-1.5">
                <dt className="font-medium">Concerns</dt>
                <dd className="text-muted-foreground whitespace-pre-wrap">
                  {narrative(revision.concerns)}
                </dd>
              </div>
              <div className="flex flex-col gap-1.5 lg:col-span-2">
                <dt className="font-medium">Notes</dt>
                <dd className="text-muted-foreground whitespace-pre-wrap">
                  {narrative(revision.notes)}
                </dd>
              </div>
            </dl>

            {revision.ratings.length > 0 ? (
              <>
                <Separator />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Criterion</TableHead>
                      <TableHead>Weight</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Comment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revision.ratings.map((rating) => (
                      <TableRow key={rating.criterionId}>
                        <TableCell className="font-medium">
                          {rating.label}
                        </TableCell>
                        <TableCell>{rating.weight}</TableCell>
                        <TableCell>{rating.rating} / 5</TableCell>
                        <TableCell className="max-w-96 whitespace-normal">
                          {narrative(rating.comment)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function ScorecardRevisionViewer({
  groups,
}: {
  groups: ScorecardRevisionGroup[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" aria-hidden />
          Feedback revisions
        </CardTitle>
        <CardDescription>
          Original submissions and every accepted edit. Latest values are open
          by default; prior snapshots remain available for audit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No feedback revisions are visible to you yet.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section
                key={group.scorecardId}
                className="flex flex-col gap-3"
                aria-labelledby={`scorecard-${group.scorecardId}`}
              >
                <div>
                  <h3
                    id={`scorecard-${group.scorecardId}`}
                    className="font-medium"
                  >
                    {group.scorecardAuthorName}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {group.stageName} · {group.revisions.length}{" "}
                    {group.revisions.length === 1 ? "snapshot" : "snapshots"}
                  </p>
                </div>
                <ol className="flex flex-col gap-2">
                  {group.revisions.map((revision, index) => (
                    <li key={revision.id}>
                      <RevisionSnapshot
                        revision={revision}
                        isLatest={index === group.revisions.length - 1}
                      />
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

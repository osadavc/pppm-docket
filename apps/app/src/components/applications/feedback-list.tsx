import Link from "next/link";
import { ChevronDown, MessageSquareText, Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
  ApplicationScorecardView,
  ApplicationScorecards,
} from "@/lib/queries/scorecards";
import { RECOMMENDATION_LABELS } from "@/lib/validation/scorecard";

function narrative(value: string | null) {
  return value?.trim() || "Not provided";
}

function overallScore(value: string | null) {
  return value ? `${Number(value).toFixed(2)} / 5` : "—";
}

function ScorecardNarrative({
  scorecard,
}: {
  scorecard: ApplicationScorecardView;
}) {
  return (
    <dl className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <dt className="font-medium">Strengths</dt>
        <dd className="text-muted-foreground whitespace-pre-wrap">
          {narrative(scorecard.strengths)}
        </dd>
      </div>
      <div className="flex flex-col gap-1.5">
        <dt className="font-medium">Concerns</dt>
        <dd className="text-muted-foreground whitespace-pre-wrap">
          {narrative(scorecard.concerns)}
        </dd>
      </div>
      <div className="flex flex-col gap-1.5 lg:col-span-2">
        <dt className="font-medium">Notes</dt>
        <dd className="text-muted-foreground whitespace-pre-wrap">
          {narrative(scorecard.notes)}
        </dd>
      </div>
    </dl>
  );
}

function ScorecardCard({
  scorecard,
  applicationId,
  viewerId,
  editable,
}: {
  scorecard: ApplicationScorecardView;
  applicationId: string;
  viewerId: string;
  editable: boolean;
}) {
  return (
    <li>
      <Collapsible>
        <Card size="sm">
          <CardHeader>
            <CardTitle>{scorecard.authorName}</CardTitle>
            <CardDescription>
              {scorecard.stageName} · {formatDateTime(scorecard.submittedAt)}
            </CardDescription>
            <CardAction className="flex flex-wrap justify-end gap-1">
              <Badge variant="outline">
                Score {overallScore(scorecard.overallScore)}
              </Badge>
              <Badge variant="secondary">
                {scorecard.recommendation
                  ? RECOMMENDATION_LABELS[scorecard.recommendation]
                  : "No recommendation"}
              </Badge>
              {editable && scorecard.authorId === viewerId ? (
                <Button asChild variant="outline" size="xs">
                  <Link
                    href={`/applications/${applicationId}/feedback?scorecard=${scorecard.id}`}
                  >
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Link>
                </Button>
              ) : null}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <ScorecardNarrative scorecard={scorecard} />

            <Separator />

            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="self-start">
                Criterion ratings ({scorecard.ratings.length})
                <ChevronDown
                  data-icon="inline-end"
                  className="transition-transform group-data-[state=open]/button:rotate-180"
                />
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              {scorecard.ratings.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No criterion ratings were recorded for this stage.
                </p>
              ) : (
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
                    {scorecard.ratings.map((rating) => (
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
              )}
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>
    </li>
  );
}

export function FeedbackList({
  feedback,
  applicationId,
  viewerId,
  editable,
}: {
  feedback: ApplicationScorecards;
  applicationId: string;
  viewerId: string;
  editable: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Feedback ({feedback.total})</CardTitle>
        <CardDescription>
          Submitted interview feedback, with criterion detail available on
          demand.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {feedback.hiddenCount > 0 ? (
          <Alert>
            <AlertDescription>
              {feedback.hiddenCount} colleague reviews are hidden until you
              submit your own — independent reads first.
            </AlertDescription>
          </Alert>
        ) : null}

        {feedback.total === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareText aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No feedback yet</EmptyTitle>
              <EmptyDescription>
                It appears here as interviewers submit their scorecards.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : feedback.scorecards.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareText aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Independent reads first</EmptyTitle>
              <EmptyDescription>
                Submit your feedback to read colleague reviews for the same
                stage.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol className="flex flex-col gap-3">
            {feedback.scorecards.map((scorecard) => (
              <ScorecardCard
                key={scorecard.id}
                scorecard={scorecard}
                applicationId={applicationId}
                viewerId={viewerId}
                editable={editable}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

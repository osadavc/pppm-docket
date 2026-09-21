"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  saveScorecard,
  type SaveScorecardResult,
} from "@/lib/actions/scorecards";
import type { FeedbackContext } from "@/lib/queries/feedback";
import {
  RECOMMENDATION_LABELS,
  recommendationValues,
} from "@/lib/validation/scorecard";

const RATING_LABELS = {
  1: "Well below",
  2: "Below",
  3: "Meets",
  4: "Above",
  5: "Exceptional",
} as const;

export function FeedbackForm({ context }: { context: FeedbackContext }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    SaveScorecardResult | null,
    FormData
  >(saveScorecard, null);
  const [recommendation, setRecommendation] = useState(
    context.scorecard?.recommendation ?? "",
  );
  const [ratings, setRatings] = useState<Record<string, string>>(
    Object.fromEntries(
      context.criteria.map((criterion) => [
        criterion.id,
        criterion.rating?.toString() ?? "",
      ]),
    ),
  );
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (!state?.ok) return;
    toast.success("Feedback submitted.");
    router.refresh();
  }, [router, state]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="applicationId" value={context.applicationId} />
      <input
        type="hidden"
        name="baseRevision"
        value={context.scorecard?.revisionNumber ?? 0}
      />
      <input type="hidden" name="recommendation" value={recommendation} />

      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <fieldset
        disabled={pending}
        className="flex flex-col gap-5 disabled:opacity-75"
      >
        <Card>
          <CardHeader>
            <CardTitle>Criterion ratings</CardTitle>
            <CardDescription>
              Rate against the evidence from this stage. Every criterion is
              scored from 1 to 5 before submission.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {context.criteria.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                This stage has no rating criteria. Add an overall recommendation
                and written feedback below.
              </p>
            ) : (
              <FieldGroup>
                {context.criteria.map((criterion) => {
                  const ratingError =
                    fieldErrors[`rating.${criterion.id}`]?.[0];
                  const commentError =
                    fieldErrors[`comment.${criterion.id}`]?.[0];

                  return (
                    <FieldSet
                      key={criterion.id}
                      className="rounded-lg border p-4"
                      data-invalid={Boolean(ratingError || commentError)}
                    >
                      <FieldLegend variant="label">
                        {criterion.label}
                      </FieldLegend>
                      {criterion.description ? (
                        <FieldDescription>
                          {criterion.description}
                        </FieldDescription>
                      ) : null}

                      <Field data-invalid={Boolean(ratingError)}>
                        <input
                          type="hidden"
                          name={`rating.${criterion.id}`}
                          value={ratings[criterion.id] ?? ""}
                        />
                        <ToggleGroup
                          type="single"
                          variant="outline"
                          value={ratings[criterion.id] ?? ""}
                          onValueChange={(value) =>
                            setRatings((current) => ({
                              ...current,
                              [criterion.id]: value,
                            }))
                          }
                          className="grid w-full grid-cols-5"
                          aria-invalid={Boolean(ratingError)}
                          aria-describedby={
                            ratingError
                              ? `rating-error-${criterion.id}`
                              : undefined
                          }
                        >
                          {([1, 2, 3, 4, 5] as const).map((rating) => (
                            <ToggleGroupItem
                              key={rating}
                              value={rating.toString()}
                              className="h-auto min-w-0 flex-col py-2"
                              aria-label={`${criterion.label}: ${rating}, ${RATING_LABELS[rating]}`}
                            >
                              <span className="text-base font-semibold tabular-nums">
                                {rating}
                              </span>
                              <span className="hidden text-[10px] leading-tight sm:block">
                                {RATING_LABELS[rating]}
                              </span>
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                        <FieldError id={`rating-error-${criterion.id}`}>
                          {ratingError}
                        </FieldError>
                      </Field>

                      <Field data-invalid={Boolean(commentError)}>
                        <FieldLabel htmlFor={`comment-${criterion.id}`}>
                          Evidence or note{" "}
                          <span className="text-muted-foreground">
                            (optional)
                          </span>
                        </FieldLabel>
                        <Textarea
                          id={`comment-${criterion.id}`}
                          name={`comment.${criterion.id}`}
                          rows={2}
                          maxLength={2000}
                          aria-invalid={Boolean(commentError)}
                          defaultValue={criterion.comment}
                        />
                        <FieldError>{commentError}</FieldError>
                      </Field>
                    </FieldSet>
                  );
                })}
              </FieldGroup>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overall recommendation</CardTitle>
            <CardDescription>
              There is no neutral option. Make the hiring signal explicit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field data-invalid={Boolean(fieldErrors.recommendation?.[0])}>
              <ToggleGroup
                type="single"
                variant="outline"
                value={recommendation}
                onValueChange={setRecommendation}
                className="grid w-full gap-2 sm:grid-cols-2"
                aria-invalid={Boolean(fieldErrors.recommendation?.[0])}
                aria-describedby={
                  fieldErrors.recommendation?.[0]
                    ? "recommendation-error"
                    : undefined
                }
              >
                {recommendationValues.map((recommendation) => (
                  <ToggleGroupItem
                    key={recommendation}
                    value={recommendation}
                    className="h-auto justify-start py-3"
                  >
                    <span className="font-medium">
                      {RECOMMENDATION_LABELS[recommendation]}
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldError id="recommendation-error">
                {fieldErrors.recommendation?.[0]}
              </FieldError>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Written feedback</CardTitle>
            <CardDescription>
              Keep observations specific enough to support the hiring decision.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid sm:grid-cols-2">
              <FieldError className="sm:col-span-2">
                {fieldErrors.narrative?.[0]}
              </FieldError>
              <Field data-invalid={Boolean(fieldErrors.strengths?.[0])}>
                <FieldLabel htmlFor="strengths">Strengths</FieldLabel>
                <Textarea
                  id="strengths"
                  name="strengths"
                  rows={4}
                  maxLength={5000}
                  aria-invalid={Boolean(fieldErrors.strengths?.[0])}
                  defaultValue={context.scorecard?.strengths}
                />
                <FieldError>{fieldErrors.strengths?.[0]}</FieldError>
              </Field>
              <Field data-invalid={Boolean(fieldErrors.concerns?.[0])}>
                <FieldLabel htmlFor="concerns">Concerns</FieldLabel>
                <Textarea
                  id="concerns"
                  name="concerns"
                  rows={4}
                  maxLength={5000}
                  aria-invalid={Boolean(fieldErrors.concerns?.[0])}
                  defaultValue={context.scorecard?.concerns}
                />
                <FieldError>{fieldErrors.concerns?.[0]}</FieldError>
              </Field>
              <Field
                className="sm:col-span-2"
                data-invalid={Boolean(fieldErrors.notes?.[0])}
              >
                <FieldLabel htmlFor="notes">Private notes</FieldLabel>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  maxLength={5000}
                  aria-invalid={Boolean(fieldErrors.notes?.[0])}
                  defaultValue={context.scorecard?.notes}
                />
                <FieldDescription>
                  Complete at least one written field with 20 or more
                  characters. Feedback remains subject to Docket&apos;s
                  visibility rules.
                </FieldDescription>
                <FieldError>{fieldErrors.notes?.[0]}</FieldError>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" name="intent" value="submit" disabled={pending}>
          <CheckCircle2 data-icon="inline-start" />
          {pending ? "Submitting…" : "Submit feedback"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Submitting shares this feedback under Docket&apos;s visibility rules.
        </p>
      </div>
    </form>
  );
}

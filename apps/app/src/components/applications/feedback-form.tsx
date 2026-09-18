"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Save } from "lucide-react";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
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
  const submitted = context.scorecard?.status === "submitted";

  useEffect(() => {
    if (!state?.ok) return;
    toast.success(
      state.data.status === "submitted" ? "Feedback submitted" : "Draft saved",
    );
    router.refresh();
  }, [router, state]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="applicationId" value={context.applicationId} />

      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {submitted ? (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>
            This scorecard has been submitted. Submitted feedback is read-only.
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset
        disabled={submitted || pending}
        className="space-y-5 disabled:opacity-75"
      >
        <Card>
          <CardHeader>
            <CardTitle>Criterion ratings</CardTitle>
            <CardDescription>
              Rate against the evidence from this stage. Every criterion is
              scored from 1 to 5 before submission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {context.criteria.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                This stage has no rating criteria. Add an overall recommendation
                and written feedback below.
              </p>
            ) : (
              context.criteria.map((criterion) => (
                <section
                  key={criterion.id}
                  className="rounded-lg border p-4"
                  aria-labelledby={`criterion-${criterion.id}`}
                >
                  <div className="mb-3">
                    <h2
                      id={`criterion-${criterion.id}`}
                      className="font-medium"
                    >
                      {criterion.label}
                    </h2>
                    {criterion.description ? (
                      <p className="text-muted-foreground mt-0.5 text-sm">
                        {criterion.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-5 gap-1.5" role="radiogroup">
                    {([1, 2, 3, 4, 5] as const).map((rating) => (
                      <label
                        key={rating}
                        className="has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground hover:bg-muted flex min-w-0 cursor-pointer flex-col items-center rounded-md border px-1 py-2 text-center transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring"
                      >
                        <input
                          type="radio"
                          name={`rating.${criterion.id}`}
                          value={rating}
                          defaultChecked={criterion.rating === rating}
                          className="sr-only"
                          aria-label={`${criterion.label}: ${rating}, ${RATING_LABELS[rating]}`}
                        />
                        <span className="text-base font-semibold tabular-nums">
                          {rating}
                        </span>
                        <span className="hidden text-[10px] leading-tight sm:block">
                          {RATING_LABELS[rating]}
                        </span>
                      </label>
                    ))}
                  </div>

                  <Field className="mt-3">
                    <FieldLabel htmlFor={`comment-${criterion.id}`}>
                      Evidence or note{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </FieldLabel>
                    <Textarea
                      id={`comment-${criterion.id}`}
                      name={`comment.${criterion.id}`}
                      rows={2}
                      defaultValue={criterion.comment}
                    />
                  </Field>
                </section>
              ))
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
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {recommendationValues.map((recommendation) => (
                <label
                  key={recommendation}
                  className="has-checked:border-primary has-checked:bg-primary/5 hover:bg-muted flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring"
                >
                  <input
                    type="radio"
                    name="recommendation"
                    value={recommendation}
                    defaultChecked={
                      context.scorecard?.recommendation === recommendation
                    }
                    className="size-4 accent-current"
                  />
                  <span className="font-medium">
                    {RECOMMENDATION_LABELS[recommendation]}
                  </span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Written feedback</CardTitle>
            <CardDescription>
              Keep observations specific enough to support the hiring decision.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="strengths">Strengths</FieldLabel>
              <Textarea
                id="strengths"
                name="strengths"
                rows={4}
                defaultValue={context.scorecard?.strengths}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="concerns">Concerns</FieldLabel>
              <Textarea
                id="concerns"
                name="concerns"
                rows={4}
                defaultValue={context.scorecard?.concerns}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="notes">Private notes</FieldLabel>
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={context.scorecard?.notes}
              />
              <FieldDescription>
                Visible to the hiring team under Docket&apos;s feedback
                visibility rules.
              </FieldDescription>
            </Field>
          </CardContent>
        </Card>
      </fieldset>

      {!submitted ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="intent" value="submit" disabled={pending}>
            <CheckCircle2 /> {pending ? "Saving…" : "Submit feedback"}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="draft"
            variant="outline"
            disabled={pending}
          >
            <Save /> Save draft
          </Button>
          <p className="text-muted-foreground text-xs">
            Submitted feedback cannot be edited.
          </p>
        </div>
      ) : null}
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { submitScorecard } from "@/lib/actions/scorecards";
import {
  RECOMMENDATIONS,
  RECOMMENDATION_LABELS,
  type SubmitScorecardInput,
} from "@/lib/validation/scorecard";

type Recommendation = SubmitScorecardInput["recommendation"];

export type ScorecardFormContext = {
  applicationId: string;
  candidateName: string;
  stageName: string;
  recommendation: Recommendation | null;
  strengths: string | null;
  concerns: string | null;
  notes: string | null;
  hasSubmitted: boolean;
};

export function ScorecardForm({ context }: { context: ScorecardFormContext }) {
  const router = useRouter();
  const [recommendation, setRecommendation] = useState<Recommendation | "">(
    context.recommendation ?? "",
  );
  const [strengths, setStrengths] = useState(context.strengths ?? "");
  const [concerns, setConcerns] = useState(context.concerns ?? "");
  const [notes, setNotes] = useState(context.notes ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit() {
    if (!recommendation) return;
    setPending(true);
    setError(undefined);
    const result = await submitScorecard({
      applicationId: context.applicationId,
      recommendation,
      strengths: strengths || undefined,
      concerns: concerns || undefined,
      notes: notes || undefined,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(
      context.hasSubmitted ? "Feedback updated" : `Feedback submitted for ${result.data.stageName}`,
    );
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{context.hasSubmitted ? "Update feedback" : "Submit feedback"}</CardTitle>
        <CardDescription>
          Your assessment of {context.candidateName} for {context.stageName}. Submitting
          it unlocks your panel&apos;s feedback for this stage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Field>
          <FieldLabel>Recommendation</FieldLabel>
          <RadioGroup
            value={recommendation}
            onValueChange={(value) => setRecommendation(value as Recommendation)}
            className="grid gap-2 sm:grid-cols-2"
          >
            {RECOMMENDATIONS.map((value) => (
              <Label
                key={value}
                htmlFor={`recommendation-${value}`}
                className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border p-3 font-normal"
              >
                <RadioGroupItem value={value} id={`recommendation-${value}`} />
                {RECOMMENDATION_LABELS[value]}
              </Label>
            ))}
          </RadioGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="scorecard-strengths">Strengths</FieldLabel>
          <Textarea
            id="scorecard-strengths"
            rows={3}
            value={strengths}
            onChange={(event) => setStrengths(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="scorecard-concerns">Concerns</FieldLabel>
          <Textarea
            id="scorecard-concerns"
            rows={3}
            value={concerns}
            onChange={(event) => setConcerns(event.target.value)}
          />
          <FieldDescription>
            This feedback is visible to the hiring team and, after submission, your fellow
            panel members.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="scorecard-notes">Additional notes</FieldLabel>
          <Textarea
            id="scorecard-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>

        <Button onClick={submit} disabled={pending || !recommendation}>
          {pending ? "Submitting…" : context.hasSubmitted ? "Update feedback" : "Submit feedback"}
        </Button>
      </CardContent>
    </Card>
  );
}

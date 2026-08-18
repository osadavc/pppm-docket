"use client";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { StageFormInput } from "@/lib/validation/stage";

const KIND_LABELS = {
  screening: "Screening — a paper sift, no interview scheduled",
  interview: "Interview — a scheduled conversation",
  assessment: "Assessment — a take-home or practical task",
  offer: "Offer — approval and offer issued",
} as const;

export function StageFormFields({
  value,
  onChange,
  idPrefix,
}: {
  value: StageFormInput;
  onChange: (next: StageFormInput) => void;
  idPrefix: string;
}) {
  const set = <K extends keyof StageFormInput>(key: K, v: StageFormInput[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Stage name</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Technical Interview"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-description`}>Guidance for interviewers</FieldLabel>
        <Textarea
          id={`${idPrefix}-description`}
          rows={2}
          value={value.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-kind`}>Type</FieldLabel>
        <Select
          value={value.kind}
          onValueChange={(v) => set("kind", v as StageFormInput["kind"])}
        >
          <SelectTrigger id={`${idPrefix}-kind`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field orientation="horizontal">
        <Switch
          id={`${idPrefix}-requires`}
          checked={value.requiresScorecard}
          onCheckedChange={(v) =>
            onChange({ ...value, requiresScorecard: v, minScorecards: v ? Math.max(1, value.minScorecards) : 0 })
          }
        />
        <div>
          <FieldLabel htmlFor={`${idPrefix}-requires`}>Requires feedback</FieldLabel>
          <FieldDescription>
            Candidates cannot leave this stage until the scorecards are in.
          </FieldDescription>
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-min`}>Scorecards required</FieldLabel>
          <Input
            id={`${idPrefix}-min`}
            type="number"
            min={0}
            max={10}
            disabled={!value.requiresScorecard}
            value={value.minScorecards}
            onChange={(e) => set("minScorecards", Number(e.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-sla`}>Target days</FieldLabel>
          <Input
            id={`${idPrefix}-sla`}
            type="number"
            min={1}
            value={value.slaDays === "" || value.slaDays === undefined ? "" : value.slaDays}
            onChange={(e) =>
              set("slaDays", e.target.value === "" ? "" : Number(e.target.value))
            }
          />
          <FieldDescription>How long this stage should take.</FieldDescription>
        </Field>
      </div>
    </div>
  );
}

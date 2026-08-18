"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
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
import { createDraftPosition, updatePosition } from "@/lib/actions/positions";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/format";
import {
  positionDraftSchema,
  type PositionDraftInput,
} from "@/lib/validation/position";

type Manager = { id: string; name: string };

export function PositionForm({
  positionId,
  defaultValues,
  managers,
}: {
  positionId?: string;
  defaultValues: PositionDraftInput;
  managers: Manager[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const isEdit = Boolean(positionId);

  const form = useForm<PositionDraftInput>({
    resolver: zodResolver(positionDraftSchema),
    defaultValues,
  });

  const employmentType = useWatch({ control: form.control, name: "employmentType" });
  const hiringManagerId = useWatch({ control: form.control, name: "hiringManagerId" });
  const requireFeedback = useWatch({
    control: form.control,
    name: "requireFeedbackToAdvance",
  });

  async function onSubmit(values: PositionDraftInput) {
    setFormError(undefined);
    const result = positionId
      ? await updatePosition(positionId, values)
      : await createDraftPosition(values);

    if (!result.ok) {
      setFormError(result.error);
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) {
          form.setError(field as keyof PositionDraftInput, { message: messages[0] });
        }
      }
      return;
    }

    toast.success(isEdit ? "Draft saved" : "Draft position created");
    router.push(`/positions/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>The role</CardTitle>
          <CardDescription>
            Only a title and department are needed to save a draft — fill in the
            rest whenever you are ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field data-invalid={!!form.formState.errors.title}>
            <FieldLabel htmlFor="title">Job title</FieldLabel>
            <Input id="title" placeholder="Senior Frontend Engineer" {...form.register("title")} />
            <FieldError errors={[form.formState.errors.title]} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!form.formState.errors.department}>
              <FieldLabel htmlFor="department">Department</FieldLabel>
              <Input id="department" placeholder="Engineering" {...form.register("department")} />
              <FieldError errors={[form.formState.errors.department]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="location">Location</FieldLabel>
              <Input id="location" placeholder="Colombo / Remote" {...form.register("location")} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="employmentType">Employment type</FieldLabel>
              <Select
                value={employmentType}
                onValueChange={(v) =>
                  form.setValue("employmentType", v as PositionDraftInput["employmentType"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="employmentType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field data-invalid={!!form.formState.errors.openings}>
              <FieldLabel htmlFor="openings">Number of openings</FieldLabel>
              <Input
                id="openings"
                type="number"
                min={1}
                {...form.register("openings", { valueAsNumber: true })}
              />
              <FieldError errors={[form.formState.errors.openings]} />
            </Field>
          </div>

          <Field data-invalid={!!form.formState.errors.applicationDeadline}>
            <FieldLabel htmlFor="applicationDeadline">Application deadline</FieldLabel>
            <Input
              id="applicationDeadline"
              type="date"
              className="w-full sm:w-56"
              {...form.register("applicationDeadline")}
            />
            <FieldDescription>
              Optional while drafting. Applications close at the end of this day.
            </FieldDescription>
            <FieldError errors={[form.formState.errors.applicationDeadline]} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
          <CardDescription>
            What the job is and what you need from the person doing it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="description">Job description</FieldLabel>
            <Textarea id="description" rows={8} {...form.register("description")} />
            <FieldDescription>Markdown is preserved.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="requirements">Requirements</FieldLabel>
            <Textarea id="requirements" rows={5} {...form.register("requirements")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hiring setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!form.formState.errors.salaryMin}>
              <FieldLabel htmlFor="salaryMin">Salary from</FieldLabel>
              <Input id="salaryMin" type="number" min={0} {...form.register("salaryMin")} />
              <FieldError errors={[form.formState.errors.salaryMin]} />
            </Field>
            <Field data-invalid={!!form.formState.errors.salaryMax}>
              <FieldLabel htmlFor="salaryMax">Salary to</FieldLabel>
              <Input id="salaryMax" type="number" min={0} {...form.register("salaryMax")} />
              <FieldError errors={[form.formState.errors.salaryMax]} />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="hiringManagerId">Hiring manager</FieldLabel>
            <Select
              value={hiringManagerId || "none"}
              onValueChange={(v) => form.setValue("hiringManagerId", v === "none" ? "" : v)}
            >
              <SelectTrigger id="hiringManagerId" className="w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field orientation="horizontal">
            <Switch
              id="requireFeedbackToAdvance"
              checked={requireFeedback}
              onCheckedChange={(v) => form.setValue("requireFeedbackToAdvance", v)}
            />
            <div>
              <FieldLabel htmlFor="requireFeedbackToAdvance">
                Require feedback before advancing
              </FieldLabel>
              <FieldDescription>
                Candidates cannot move to the next stage until the interviewers
                on the current one have submitted their scorecards.
              </FieldDescription>
            </div>
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? "Saving…"
            : isEdit
              ? "Save draft"
              : "Create draft"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

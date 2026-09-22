"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { DatePicker } from "@/components/app/date-picker";
import { MarkdownEditor } from "@/components/app/markdown-editor";
import { NumberInput } from "@/components/app/number-input";
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
            Only a title and department are needed to save a draft, fill in the
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
            <Controller
              control={form.control}
              name="applicationDeadline"
              render={({ field, fieldState }) => (
                <DatePicker
                  id="applicationDeadline"
                  className="w-full sm:w-64"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={fieldState.invalid}
                  placeholder="No deadline"
                />
              )}
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
            <Controller
              control={form.control}
              name="description"
              render={({ field }) => (
                <MarkdownEditor id="description" minRows={8} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} placeholder="What the role is, who it works with, what success looks like." />
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="requirements">Requirements</FieldLabel>
            <Controller
              control={form.control}
              name="requirements"
              render={({ field }) => (
                <MarkdownEditor id="requirements" minRows={5} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} />
              )}
            />
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
              <Controller
                control={form.control}
                name="salaryMin"
                render={({ field }) => (
                  <NumberInput id="salaryMin" placeholder="e.g. 250,000" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                )}
              />
              <FieldError errors={[form.formState.errors.salaryMin]} />
            </Field>
            <Field data-invalid={!!form.formState.errors.salaryMax}>
              <FieldLabel htmlFor="salaryMax">Salary to</FieldLabel>
              <Controller
                control={form.control}
                name="salaryMax"
                render={({ field }) => (
                  <NumberInput id="salaryMax" placeholder="e.g. 400,000" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                )}
              />
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

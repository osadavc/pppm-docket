"use client";

import { Send } from "lucide-react";
import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { applyToPosition } from "@/lib/actions/public-applications";
import { HONEYPOT_FIELD } from "@/lib/validation/public-application";

export function ApplyForm({ positionId }: { positionId: string }) {
  const [state, formAction, pending] = useActionState(applyToPosition, null);
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const err = (name: string) =>
    fieldErrors[name]?.[0] ? [{ message: fieldErrors[name]![0]! }] : [];

  return (
    <form action={formAction} noValidate className="space-y-6">
      <input type="hidden" name="positionId" value={positionId} />
      {/* Decoy for automated submissions. Hidden from people and assistive
          tech; a browser autofill never targets a field named this way. */}
      <div
        aria-hidden="true"
        className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
      >
        <label htmlFor={HONEYPOT_FIELD}>Website</label>
        <input
          id={HONEYPOT_FIELD}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!fieldErrors.fullName}>
            <FieldLabel htmlFor="fullName">Full name</FieldLabel>
            <Input id="fullName" name="fullName" autoComplete="name" required />
            <FieldError errors={err("fullName")} />
          </Field>
          <Field data-invalid={!!fieldErrors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" autoComplete="email" required />
            <FieldError errors={err("email")} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!fieldErrors.phone}>
            <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
            <Input id="phone" name="phone" type="tel" autoComplete="tel" />
            <FieldError errors={err("phone")} />
          </Field>
          <Field data-invalid={!!fieldErrors.salaryExpectation}>
            <FieldLabel htmlFor="salaryExpectation">
              Salary expectation (optional)
            </FieldLabel>
            <Input
              id="salaryExpectation"
              name="salaryExpectation"
              maxLength={60}
              placeholder="e.g. 120k–140k"
            />
            <FieldError errors={err("salaryExpectation")} />
          </Field>
        </div>

        <Field data-invalid={!!fieldErrors.cv}>
          <FieldLabel htmlFor="cv">CV</FieldLabel>
          <Input
            id="cv"
            name="cv"
            type="file"
            required
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
          <FieldDescription>PDF or Word, up to 5 MB.</FieldDescription>
          <FieldError errors={err("cv")} />
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending}>
        <Send /> {pending ? "Sending…" : "Submit application"}
      </Button>
    </form>
  );
}

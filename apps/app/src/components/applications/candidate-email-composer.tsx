"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";

export function CandidateEmailComposer({
  idPrefix,
  recipientEmail,
  enabled,
  onEnabledChange,
  subject,
  onSubjectChange,
  body,
  onBodyChange,
}: {
  idPrefix: string;
  recipientEmail: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  subject: string;
  onSubjectChange: (subject: string) => void;
  body: string;
  onBodyChange: (body: string) => void;
}) {
  const subjectInvalid = enabled && subject.trim().length === 0;
  const bodyInvalid = enabled && body.trim().length === 0;

  return (
    <FieldSet>
      <FieldLegend variant="label">Candidate communication</FieldLegend>
      <FieldDescription>
        Email stays off until you select it. When selected, it is queued only
        after the pipeline change succeeds.
      </FieldDescription>

      <FieldGroup>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`${idPrefix}-notify`}>
              Email candidate
            </FieldLabel>
            <FieldDescription>
              Include the edited message with this decision.
            </FieldDescription>
          </FieldContent>
          <Switch
            id={`${idPrefix}-notify`}
            checked={enabled}
            onCheckedChange={onEnabledChange}
          />
        </Field>

        {enabled ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-recipient`}>To</FieldLabel>
              <Input
                id={`${idPrefix}-recipient`}
                value={recipientEmail}
                readOnly
                aria-readonly="true"
              />
              <FieldDescription>
                The address comes from the candidate record and cannot be
                changed here.
              </FieldDescription>
            </Field>

            <Field data-invalid={subjectInvalid}>
              <FieldLabel htmlFor={`${idPrefix}-subject`}>Subject</FieldLabel>
              <Input
                id={`${idPrefix}-subject`}
                value={subject}
                maxLength={200}
                aria-invalid={subjectInvalid}
                onChange={(event) => onSubjectChange(event.target.value)}
              />
              {subjectInvalid ? (
                <FieldError>Enter an email subject.</FieldError>
              ) : null}
            </Field>

            <Field data-invalid={bodyInvalid}>
              <FieldLabel htmlFor={`${idPrefix}-body`}>Message</FieldLabel>
              <Textarea
                id={`${idPrefix}-body`}
                value={body}
                rows={9}
                maxLength={10_000}
                aria-invalid={bodyInvalid}
                onChange={(event) => onBodyChange(event.target.value)}
              />
              {bodyInvalid ? (
                <FieldError>Enter an email message.</FieldError>
              ) : (
                <FieldDescription>
                  Plain text preview. Edit the template before confirming.
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
        ) : null}
      </FieldGroup>
    </FieldSet>
  );
}

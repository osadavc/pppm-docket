"use client";

import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { candidateEmailToast } from "@/components/applications/email-toast";
import { sendCustomCandidateEmail } from "@/lib/actions/notifications";
import { COMPANY_NAME } from "@/lib/company";

function greeting(candidateName: string) {
  const first = candidateName.trim().split(/\s+/)[0] || "there";
  return `Hi ${first},\n\n\n\nBest,\nThe ${COMPANY_NAME} hiring team`;
}

export function ComposeEmailDialog({
  applicationId,
  candidateName,
  candidateEmail,
  positionTitle,
}: {
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  positionTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(`About your application for ${positionTitle}`);
  const [body, setBody] = useState(() => greeting(candidateName));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const err = (name: string) =>
    fieldErrors[name]?.[0] ? [{ message: fieldErrors[name]![0]! }] : [];

  const subjectLength = subject.trim().length;
  const bodyLength = body.trim().length;
  const ready =
    subjectLength >= 3 && subjectLength <= 200 && bodyLength >= 10 && bodyLength <= 5000;

  async function send() {
    setPending(true);
    setError(undefined);
    setFieldErrors({});
    const result = await sendCustomCandidateEmail({ applicationId, subject, body });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    candidateEmailToast("Message recorded.", {
      notificationId: result.data.notificationId,
      status: result.data.status,
      error: result.data.error,
    });
    setOpen(false);
    setBody(greeting(candidateName));
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <PenLine /> Compose email
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(undefined); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email {candidateName}</DialogTitle>
            <DialogDescription>
              Goes to <span className="font-medium">{candidateEmail}</span> from
              “{COMPANY_NAME} Hiring”, and is kept on this application&apos;s record.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="my-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Field data-invalid={!!fieldErrors.subject}>
              <FieldLabel htmlFor="compose-subject">Subject</FieldLabel>
              <Input
                id="compose-subject"
                value={subject}
                maxLength={200}
                onChange={(e) => setSubject(e.target.value)}
              />
              <FieldDescription>3–200 characters.</FieldDescription>
              <FieldError errors={err("subject")} />
            </Field>

            <Field data-invalid={!!fieldErrors.body}>
              <FieldLabel htmlFor="compose-body">Message</FieldLabel>
              <Textarea
                id="compose-body"
                rows={10}
                value={body}
                maxLength={5000}
                onChange={(e) => setBody(e.target.value)}
              />
              <FieldDescription>
                Plain text, 10–5,000 characters ({bodyLength.toLocaleString()} so far).
                Blank lines become paragraphs.
              </FieldDescription>
              <FieldError errors={err("body")} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={send} disabled={pending || !ready}>
              {pending ? "Sending…" : "Send email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

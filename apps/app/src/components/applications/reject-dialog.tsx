"use client";

import { UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDialogShortcut } from "@/components/applications/use-dialog-shortcut";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CandidateEmailComposer } from "@/components/applications/candidate-email-composer";
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { candidateEmailToast } from "@/components/applications/email-toast";
import { rejectApplication } from "@/lib/actions/applications";
import { COMPANY_NAME } from "@/lib/company";
import { rejection } from "@/lib/notifications/templates";
import {
  REJECTION_REASON_LABELS,
  REJECTION_REASONS,
  type RejectApplicationInput,
} from "@/lib/validation/application";
import type { AdvanceContext } from "@/lib/queries/applications";

type Reason = RejectApplicationInput["reason"];

export function RejectDialog({
  context,
  shortcutKey,
  onDone,
}: {
  context: AdvanceContext;
  shortcutKey?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // No default: a reason must be chosen deliberately, not accepted by inertia.
  const [reason, setReason] = useState<Reason | "">("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const template = rejection({
    candidateName: context.candidateName,
    positionTitle: context.positionTitle,
    companyName: COMPANY_NAME,
  });
  // Candidates should always hear back; HR opts out deliberately.
  const [notifyCandidate, setNotifyCandidate] = useState(true);
  const [emailSubject, setEmailSubject] = useState(template.subject);
  const [emailBody, setEmailBody] = useState(template.body);

  useDialogShortcut(shortcutKey, open, () => setOpen(true));

  const needsNote = reason === "other";
  const emailReady =
    !notifyCandidate ||
    (emailSubject.trim().length > 0 && emailBody.trim().length > 0);
  const ready =
    reason !== "" &&
    (!needsNote || note.trim().length >= 10) &&
    emailReady;

  async function submit() {
    if (reason === "") return;
    setPending(true);
    setError(undefined);
    const result = await rejectApplication({
      applicationId: context.applicationId,
      reason,
      note: note || undefined,
      notification: notifyCandidate
        ? { subject: emailSubject, body: emailBody }
        : undefined,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    candidateEmailToast(`${result.data.candidateName} rejected.`, result.data.email);
    setOpen(false);
    onDone?.();
    setReason("");
    setNote("");
    setNotifyCandidate(true);
    setEmailSubject(template.subject);
    setEmailBody(template.body);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserX /> Reject
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(undefined); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reject {context.candidateName}</DialogTitle>
            <DialogDescription>
              A reason is required — it is what makes drop-out reporting mean
              anything.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="my-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Field>
              <FieldLabel htmlFor="reject-reason">Reason</FieldLabel>
              <ScrollArea className="h-56 rounded-md border" id="reject-reason">
                <RadioGroup
                  value={reason}
                  onValueChange={(v) => setReason(v as Reason)}
                  className="gap-0 p-1"
                >
                  {REJECTION_REASONS.map((r) => (
                    <Label
                      key={r}
                      htmlFor={`reason-${r}`}
                      className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md p-2 font-normal"
                    >
                      <RadioGroupItem value={r} id={`reason-${r}`} />
                      {REJECTION_REASON_LABELS[r]}
                    </Label>
                  ))}
                </RadioGroup>
              </ScrollArea>
            </Field>

            <Field>
              <FieldLabel htmlFor="reject-note">
                Internal note {needsNote ? "(required)" : "(optional)"}
              </FieldLabel>
              <Textarea
                id="reject-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <FieldDescription>
                Never sent to the candidate.{" "}
                {needsNote
                  ? "“Other” tells reporting nothing on its own — say what happened."
                  : "Kept alongside the reason on the candidate’s record."}
              </FieldDescription>
            </Field>

            <CandidateEmailComposer
              idPrefix="reject-email"
              recipientEmail={context.candidateEmail}
              enabled={notifyCandidate}
              onEnabledChange={setNotifyCandidate}
              subject={emailSubject}
              onSubjectChange={setEmailSubject}
              body={emailBody}
              onBodyChange={setEmailBody}
            />
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submit} disabled={pending || !ready}>
              {pending
                ? "Rejecting…"
                : notifyCandidate
                  ? "Reject & send email"
                  : "Reject candidate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

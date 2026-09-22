"use client";

import { ArrowRight, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { CandidateEmailComposer } from "@/components/applications/candidate-email-composer";
import { candidateEmailToast } from "@/components/applications/email-toast";
import { advanceApplication } from "@/lib/actions/applications";
import { COMPANY_NAME } from "@/lib/company";
import { GATE_EXPLANATIONS } from "@/lib/domain/advancement";
import { formatNameList } from "@/lib/format";
import { stageAdvanced } from "@/lib/notifications/templates";
import { OVERRIDE_REASON_MIN_LENGTH } from "@/lib/validation/application";
import type { AdvanceContext } from "@/lib/queries/applications";

function waitingOn(outstanding: readonly string[]) {
  return outstanding.length > 0
    ? `Waiting on feedback from ${formatNameList(outstanding)}.`
    : "Waiting on interview feedback.";
}

export function AdvanceButton({
  context,
  canOverride,
}: {
  context: AdvanceContext;
  canOverride: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const template = stageAdvanced({
    candidateName: context.candidateName,
    positionTitle: context.positionTitle,
    companyName: COMPANY_NAME,
    nextStageName: context.nextStage?.name ?? "the next stage",
  });
  // Candidates should hear from us by default; HR opts *out*, not in.
  const [notifyCandidate, setNotifyCandidate] = useState(true);
  const [emailSubject, setEmailSubject] = useState(template.subject);
  const [emailBody, setEmailBody] = useState(template.body);

  const blocked = context.gate.blocked;
  const needsOverride = blocked && canOverride;
  const overrideReady = override.trim().length >= OVERRIDE_REASON_MIN_LENGTH;

  // Nothing follows the last stage — the end of a pipeline is an outcome.
  if (context.isFinalStage) {
    return (
      <Button size="sm" variant="outline" disabled title="Hire or reject instead">
        Final stage
      </Button>
    );
  }
  if (!context.nextStage || context.status !== "active") return null;

  function openDialog() {
    if (blocked) {
      // Say why up front, before they read the dialog: the toast is the same
      // sentence the server will answer with if they try anyway.
      toast.warning(waitingOn(context.outstandingInterviewers), {
        description: canOverride
          ? "You can advance anyway by recording a reason."
          : undefined,
      });
    }
    setOpen(true);
  }

  function reset() {
    setNote("");
    setOverride("");
    setNotifyCandidate(true);
    setEmailSubject(template.subject);
    setEmailBody(template.body);
  }

  async function submit() {
    setPending(true);
    setError(undefined);
    const result = await advanceApplication({
      applicationId: context.applicationId,
      note: note || undefined,
      overrideReason: needsOverride ? override || undefined : undefined,
      notification: notifyCandidate
        ? { subject: emailSubject, body: emailBody }
        : undefined,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const moved = `${result.data.candidateName} moved to ${result.data.toStageName}${
      result.data.overridden ? ", overriding the feedback gate" : ""
    }.`;
    candidateEmailToast(moved, result.data.email);
    setOpen(false);
    reset();
    router.refresh();
  }

  const emailReady =
    !notifyCandidate ||
    (emailSubject.trim().length > 0 && emailBody.trim().length > 0);

  const cta = pending
    ? "Moving…"
    : needsOverride
      ? "Advance anyway"
      : `Move to ${context.nextStage.name}`;

  return (
    <>
      <Button size="sm" variant={blocked ? "outline" : "default"} onClick={openDialog}>
        <ArrowRight /> Advance
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(undefined); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Advance {context.candidateName}</DialogTitle>
            <DialogDescription>
              {context.currentStage?.name} → {context.nextStage.name}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="my-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {blocked ? (
              <Alert variant={canOverride ? "default" : "destructive"}>
                <TriangleAlert />
                <AlertTitle>{waitingOn(context.outstandingInterviewers)}</AlertTitle>
                <AlertDescription>
                  {GATE_EXPLANATIONS[context.gate.reason]}{" "}
                  {context.gate.outstanding} more scorecard
                  {context.gate.outstanding === 1 ? "" : "s"} needed before
                  leaving {context.currentStage?.name}.
                  {canOverride
                    ? null
                    : " Only HR can advance past an unsatisfied gate."}
                </AlertDescription>
              </Alert>
            ) : null}

            {needsOverride ? (
              <Field>
                <FieldLabel htmlFor="override">
                  Advance anyway — record a reason
                </FieldLabel>
                <Textarea
                  id="override"
                  rows={3}
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                  placeholder="Panel member is on leave; hiring manager approved by email."
                  aria-invalid={override.length > 0 && !overrideReady}
                />
                <FieldDescription>
                  Required (at least {OVERRIDE_REASON_MIN_LENGTH} characters) and
                  shown to HR and management on the candidate&apos;s permanent
                  record.
                </FieldDescription>
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor="advance-note">Note</FieldLabel>
              <Textarea
                id="advance-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <FieldDescription>Optional, recorded against the stage.</FieldDescription>
            </Field>

            <CandidateEmailComposer
              idPrefix="advance-email"
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
            <Button
              onClick={submit}
              variant={needsOverride ? "destructive" : "default"}
              disabled={
                pending ||
                !emailReady ||
                (needsOverride && !overrideReady) ||
                (blocked && !canOverride)
              }
            >
              {cta}
              {!pending && notifyCandidate ? " & send email" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

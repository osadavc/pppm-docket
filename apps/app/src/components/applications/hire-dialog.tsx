"use client";

import Link from "next/link";
import { BadgeCheck, PartyPopper, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { CandidateEmailComposer } from "@/components/applications/candidate-email-composer";
import { candidateEmailToast } from "@/components/applications/email-toast";
import { hireApplication } from "@/lib/actions/applications";
import { COMPANY_NAME } from "@/lib/company";
import { hired as hiredTemplate } from "@/lib/notifications/templates";
import type { AdvanceContext } from "@/lib/queries/applications";
import type { FillSummary } from "@/lib/queries/positions";

type Outcome = {
  hired: number;
  openings: number;
  openingsFilled: boolean;
  exceedsOpenings: boolean;
};

export function HireDialog({
  context,
  fill,
}: {
  context: AdvanceContext;
  fill: FillSummary;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const template = hiredTemplate({
    candidateName: context.candidateName,
    positionTitle: context.positionTitle,
    companyName: COMPANY_NAME,
  });
  const [notifyCandidate, setNotifyCandidate] = useState(true);
  const [emailSubject, setEmailSubject] = useState(template.subject);
  const [emailBody, setEmailBody] = useState(template.body);
  const emailReady = !notifyCandidate || (emailSubject.trim().length > 0 && emailBody.trim().length > 0);

  // Warn before the fact too, not only after: hiring this person would take
  // the position past its approved headcount.
  const wouldExceed = fill.hired + 1 > fill.openings;

  async function submit() {
    setPending(true);
    setError(undefined);
    const result = await hireApplication({
      applicationId: context.applicationId,
      note: note || undefined,
      notification: notifyCandidate ? { subject: emailSubject, body: emailBody } : undefined,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    candidateEmailToast(`${context.candidateName} hired.`, result.data.email);
    setOutcome(result.data);
    router.refresh();
  }

  function close() {
    setOpen(false);
    setOutcome(null);
    setNote("");
    setError(undefined);
    setNotifyCandidate(true);
    setEmailSubject(template.subject);
    setEmailBody(template.body);
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <BadgeCheck /> Hire
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {outcome ? (
            // AC: once hires reach the opening count, prompt to close the
            // position out rather than leaving it advertised.
            <>
              <DialogHeader>
                <DialogTitle>
                  {context.candidateName} hired
                </DialogTitle>
                <DialogDescription>
                  {outcome.hired} of {outcome.openings} opening
                  {outcome.openings === 1 ? "" : "s"} on “{context.positionTitle}”
                  {outcome.openings === 1 ? " is" : " are"} now filled.
                </DialogDescription>
              </DialogHeader>

              {outcome.openingsFilled ? (
                <Alert className="my-2">
                  <PartyPopper />
                  <AlertTitle>
                    {outcome.exceedsOpenings
                      ? "That is more hires than approved openings"
                      : "Every opening is filled"}
                  </AlertTitle>
                  <AlertDescription>
                    Mark the position filled so it comes off the careers board
                    and stops taking applications.
                  </AlertDescription>
                </Alert>
              ) : null}

              <DialogFooter>
                <Button variant="outline" onClick={close}>
                  Not yet
                </Button>
                {outcome.openingsFilled ? (
                  <Button asChild>
                    <Link href={`/positions/${context.positionId}`}>
                      Go to the position
                    </Link>
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Hire {context.candidateName}</DialogTitle>
                <DialogDescription>
                  {context.positionTitle} · {fill.hired} of {fill.openings} opening
                  {fill.openings === 1 ? "" : "s"} filled so far.
                </DialogDescription>
              </DialogHeader>

              <div className="my-4 space-y-4">
                {error ? (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                {wouldExceed ? (
                  <Alert>
                    <TriangleAlert />
                    <AlertDescription>
                      This would be hire {fill.hired + 1} against {fill.openings}{" "}
                      approved opening{fill.openings === 1 ? "" : "s"}. Allowed, but
                      recorded as over headcount.
                    </AlertDescription>
                  </Alert>
                ) : null}

                <Field>
                  <FieldLabel htmlFor="hire-note">Note</FieldLabel>
                  <Textarea
                    id="hire-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Start date, agreed package, anything worth keeping."
                  />
                  <FieldDescription>
                    Optional, kept on the candidate&apos;s permanent record.
                  </FieldDescription>
                </Field>

                <CandidateEmailComposer
                  idPrefix="hire-email"
                  recipientEmail={context.candidateEmail}
                  enabled={notifyCandidate}
                  onEnabledChange={setNotifyCandidate}
                  subject={emailSubject}
                  onSubjectChange={setEmailSubject}
                  body={emailBody}
                  onBodyChange={setEmailBody}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={pending || !emailReady}>
                  {pending ? "Hiring…" : notifyCandidate ? "Confirm hire & send email" : "Confirm hire"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

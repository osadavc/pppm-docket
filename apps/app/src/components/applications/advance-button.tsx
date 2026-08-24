"use client";

import { ArrowRight, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { advanceApplication } from "@/lib/actions/applications";
import { GATE_EXPLANATIONS } from "@/lib/domain/advancement";
import type { AdvanceContext } from "@/lib/queries/applications";

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

  const blocked = context.gate.blocked;
  const needsOverride = blocked && canOverride;

  // Nothing follows the last stage — the end of a pipeline is an outcome.
  if (context.isFinalStage) {
    return (
      <Button size="sm" variant="outline" disabled title="Hire or reject instead">
        Final stage
      </Button>
    );
  }
  if (!context.nextStage || context.status !== "active") return null;

  async function submit() {
    setPending(true);
    setError(undefined);
    const result = await advanceApplication({
      applicationId: context.applicationId,
      note: note || undefined,
      overrideReason: needsOverride ? override || undefined : undefined,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Moved to ${result.data.toStageName}`);
    setOpen(false);
    setNote("");
    setOverride("");
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant={blocked ? "outline" : "default"} onClick={() => setOpen(true)}>
        <ArrowRight /> Advance
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(undefined); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Advance {context.candidateName}</DialogTitle>
            <DialogDescription>
              {context.currentStage?.name} → {context.nextStage.name}
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {blocked ? (
              <Alert variant={canOverride ? "default" : "destructive"}>
                <TriangleAlert />
                <AlertDescription>
                  {GATE_EXPLANATIONS[context.gate.reason]}{" "}
                  {context.gate.outstanding} more scorecard
                  {context.gate.outstanding === 1 ? "" : "s"} needed
                  {context.outstandingInterviewers.length > 0
                    ? ` — waiting on ${context.outstandingInterviewers.join(", ")}.`
                    : "."}
                </AlertDescription>
              </Alert>
            ) : null}

            {needsOverride ? (
              <Field>
                <FieldLabel htmlFor="override">Reason for overriding</FieldLabel>
                <Textarea
                  id="override"
                  rows={3}
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                  placeholder="Panel member is on leave; hiring manager approved by email."
                />
                <FieldDescription>
                  Required, and kept on the candidate&apos;s permanent record.
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={pending || (needsOverride && override.trim().length < 10) || (blocked && !canOverride)}
            >
              {pending ? "Moving…" : `Move to ${context.nextStage.name}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

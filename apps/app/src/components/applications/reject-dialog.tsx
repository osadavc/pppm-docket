"use client";

import { UserX } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { rejectApplication } from "@/lib/actions/applications";
import {
  REJECTION_REASON_LABELS,
  REJECTION_REASONS,
  type RejectApplicationInput,
} from "@/lib/validation/application";
import type { AdvanceContext } from "@/lib/queries/applications";

type Reason = RejectApplicationInput["reason"];

export function RejectDialog({ context }: { context: AdvanceContext }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // No default: a reason must be chosen deliberately, not accepted by inertia.
  const [reason, setReason] = useState<Reason | "">("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const needsNote = reason === "other";
  const ready = reason !== "" && (!needsNote || note.trim().length >= 10);

  async function submit() {
    if (reason === "") return;
    setPending(true);
    setError(undefined);
    const result = await rejectApplication({
      applicationId: context.applicationId,
      reason,
      note: note || undefined,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`${context.candidateName} rejected`);
    setOpen(false);
    setReason("");
    setNote("");
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserX /> Reject
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(undefined); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {context.candidateName}</DialogTitle>
            <DialogDescription>
              A reason is required — it is what makes drop-out reporting mean
              anything.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
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
                Detail {needsNote ? "(required)" : "(optional)"}
              </FieldLabel>
              <Textarea
                id="reject-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <FieldDescription>
                {needsNote
                  ? "“Other” tells reporting nothing on its own — say what happened."
                  : "Kept alongside the reason on the candidate’s record."}
              </FieldDescription>
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submit} disabled={pending || !ready}>
              {pending ? "Rejecting…" : "Reject candidate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

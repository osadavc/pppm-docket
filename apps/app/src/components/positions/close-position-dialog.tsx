"use client";

import { CircleSlash, TriangleAlert } from "lucide-react";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { closePosition } from "@/lib/actions/positions";
import {
  TERMINAL_STATUS_COPY,
  TERMINAL_STATUSES,
  type TerminalStatus,
} from "@/lib/domain/position-status";
import type { FillSummary } from "@/lib/queries/positions";

export function ClosePositionDialog({
  positionId,
  title,
  summary,
}: {
  positionId: string;
  title: string;
  summary: FillSummary;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<TerminalStatus>("filled");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  // The warning is advisory: a role is often filled with fewer people than
  // were budgeted, and refusing to record that would just leave positions
  // open forever.
  const underHired = status === "filled" && summary.shortfall > 0;

  async function submit() {
    setPending(true);
    setError(undefined);
    const result = await closePosition({ positionId, status, note: note || undefined });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Marked ${TERMINAL_STATUS_COPY[status].label.toLowerCase()}`);
    setOpen(false);
    setNote("");
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CircleSlash /> End search
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(undefined); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>End the search</DialogTitle>
            <DialogDescription>
              “{title}” comes off the careers board and stops accepting new
              applications. Candidates already in the pipeline are unaffected.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <RadioGroup
              value={status}
              onValueChange={(v) => setStatus(v as TerminalStatus)}
              className="gap-3"
            >
              {TERMINAL_STATUSES.map((s) => (
                <div key={s} className="flex items-start gap-3">
                  <RadioGroupItem value={s} id={`close-${s}`} className="mt-1" />
                  <div>
                    <Label htmlFor={`close-${s}`}>{TERMINAL_STATUS_COPY[s].label}</Label>
                    <p className="text-muted-foreground text-sm">
                      {TERMINAL_STATUS_COPY[s].description}
                    </p>
                  </div>
                </div>
              ))}
            </RadioGroup>

            {underHired ? (
              <Alert>
                <TriangleAlert />
                <AlertTitle>
                  {summary.hired} of {summary.openings} openings hired
                </AlertTitle>
                <AlertDescription>
                  {summary.shortfall} opening{summary.shortfall === 1 ? "" : "s"} will go
                  unfilled. You can still mark it filled — the shortfall is recorded.
                </AlertDescription>
              </Alert>
            ) : null}

            <Field>
              <FieldLabel htmlFor="closure-note">Note</FieldLabel>
              <Textarea
                id="closure-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  status === "cancelled"
                    ? "Headcount pulled for the next quarter…"
                    : "Anything worth knowing later."
                }
              />
              <FieldDescription>
                Optional, but useful when this shows up in reporting months later.
              </FieldDescription>
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Saving…" : `Mark ${TERMINAL_STATUS_COPY[status].label.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

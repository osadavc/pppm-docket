"use client";

import { Check, X } from "lucide-react";
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
import { approvePosition, rejectPosition } from "@/lib/actions/positions";

type Mode = "approve" | "reject" | null;

export function ReviewDecisionButtons({
  positionId,
  title,
  size = "default",
}: {
  positionId: string;
  title: string;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  function close() {
    setMode(null);
    setNote("");
    setError(undefined);
  }

  async function decide() {
    setPending(true);
    setError(undefined);
    const result =
      mode === "approve"
        ? await approvePosition({ positionId, note: note || undefined })
        : await rejectPosition({ positionId, note });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(
      mode === "approve"
        ? "Approved — the position is now on the careers board"
        : "Returned to HR with your note",
    );
    close();
    router.refresh();
  }

  const isReject = mode === "reject";

  return (
    <>
      <div className="flex items-center gap-2">
        <Button size={size} variant="outline" onClick={() => setMode("reject")}>
          <X /> Reject
        </Button>
        <Button size={size} onClick={() => setMode("approve")}>
          <Check /> Approve
        </Button>
      </div>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isReject ? "Reject position" : "Approve position"}</DialogTitle>
            <DialogDescription>
              {isReject
                ? `“${title}” goes back to HR as a draft. Your note tells them what to fix.`
                : `“${title}” opens immediately and is published to the careers board.`}
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Field>
              <FieldLabel htmlFor="review-note">
                {isReject ? "What needs to change" : "Note (optional)"}
              </FieldLabel>
              <Textarea
                id="review-note"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isReject
                    ? "The salary band is below approved range for this level…"
                    : "Anything HR should know."
                }
              />
              <FieldDescription>
                {isReject
                  ? "Required, and visible to HR on the position."
                  : "Recorded against the approval."}
              </FieldDescription>
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={decide}
              variant={isReject ? "destructive" : "default"}
              disabled={pending || (isReject && note.trim().length < 10)}
            >
              {pending ? "Saving…" : isReject ? "Reject and return" : "Approve and open"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

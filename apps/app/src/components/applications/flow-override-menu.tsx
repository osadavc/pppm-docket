"use client";

import {
  ChevronsRight,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Undo2,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  holdApplication,
  moveApplicationBack,
  resumeApplication,
  skipStage,
} from "@/lib/actions/applications";
import type { AdvanceContext } from "@/lib/queries/applications";

type Kind = "skip" | "back" | "hold" | "resume";

const COPY: Record<Kind, { title: string; blurb: string; cta: string }> = {
  skip: {
    title: "Skip this stage",
    blurb:
      "The stage is recorded as skipped, not passed — the record will not imply feedback that was never given.",
    cta: "Skip stage",
  },
  back: {
    title: "Move back a stage",
    blurb:
      "They return to the previous stage. Feedback already given is kept exactly as it is.",
    cta: "Move back",
  },
  hold: {
    title: "Put on hold",
    blurb:
      "They keep their place in the pipeline but drop out of active counts until resumed.",
    cta: "Put on hold",
  },
  resume: {
    title: "Resume",
    blurb:
      "They rejoin active counts, and their time-in-stage clock restarts from now.",
    cta: "Resume",
  },
};

export function FlowOverrideMenu({ context }: { context: AdvanceContext }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const onHold = context.status === "on_hold";
  const active = context.status === "active";

  async function run() {
    if (!kind) return;
    setPending(true);
    setError(undefined);

    const payload = { applicationId: context.applicationId, note: note || undefined };
    const result =
      kind === "skip"
        ? await skipStage(payload)
        : kind === "back"
          ? await moveApplicationBack(payload)
          : kind === "hold"
            ? await holdApplication(payload)
            : await resumeApplication(payload);

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(COPY[kind].title);
    setKind(null);
    setNote("");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Exceptions for ${context.candidateName}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!active || !context.nextStage}
            onSelect={() => setKind("skip")}
          >
            <ChevronsRight /> Skip stage
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!active || (context.currentStage?.orderIndex ?? 0) === 0}
            onSelect={() => setKind("back")}
          >
            <Undo2 /> Move back
          </DropdownMenuItem>
          {onHold ? (
            <DropdownMenuItem onSelect={() => setKind("resume")}>
              <PlayCircle /> Resume
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={!active} onSelect={() => setKind("hold")}>
              <PauseCircle /> Put on hold
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={kind !== null} onOpenChange={(o) => { if (!o) { setKind(null); setError(undefined); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{kind ? COPY[kind].title : ""}</DialogTitle>
            <DialogDescription>
              {context.candidateName} — {context.currentStage?.name ?? "no stage"}
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <p className="text-muted-foreground text-sm">{kind ? COPY[kind].blurb : ""}</p>

            <Field>
              <FieldLabel htmlFor="override-note">Note</FieldLabel>
              <Textarea
                id="override-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why this exception was needed."
              />
              <FieldDescription>
                Optional, and kept on the candidate&apos;s permanent record.
              </FieldDescription>
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setKind(null)}>
              Cancel
            </Button>
            <Button onClick={run} disabled={pending}>
              {pending ? "Saving…" : kind ? COPY[kind].cta : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

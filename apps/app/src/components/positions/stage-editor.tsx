"use client";

import { ArrowDown, ArrowUp, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { StageFormFields } from "@/components/positions/stage-form-fields";
import { StagePanelDialog } from "@/components/positions/stage-panel-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createStage,
  deleteStage,
  reorderStages,
  updateStage,
} from "@/lib/actions/stages";
import { EMPTY_STAGE, type StageFormInput } from "@/lib/validation/stage";
import type { StagePanelMember } from "@/lib/queries/stage-interviewers";

export type EditableStage = StageFormInput & { id: string };

export function StageEditor({
  positionId,
  stages,
  locked,
  panels,
  assignableInterviewers,
}: {
  positionId: string;
  stages: EditableStage[];
  locked: boolean;
  /** Standing panel per stage id. */
  panels: Record<string, StagePanelMember[]>;
  assignableInterviewers: StagePanelMember[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<StageFormInput>(EMPTY_STAGE);
  const [editing, setEditing] = useState<EditableStage | null>(null);
  const [removing, setRemoving] = useState<EditableStage | null>(null);
  const [error, setError] = useState<string>();

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    setError(undefined);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error ?? "That did not work.");
      return false;
    }
    toast.success(done);
    router.refresh();
    return true;
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...stages];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    await run(
      () => reorderStages(positionId, next.map((s) => s.id)),
      "Order updated",
    );
  }

  return (
    <div className="space-y-4">
      {locked ? (
        <Alert>
          <Lock />
          <AlertTitle>Pipeline locked</AlertTitle>
          <AlertDescription>
            Candidates have already applied, so stages cannot be added, removed
            or reordered — that would move people mid-process. Renaming and
            per-stage settings are still editable.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ol className="space-y-3">
        {stages.map((stage, index) => (
          <li key={stage.id}>
            <Card className="flex flex-row items-start gap-4 p-4">
              <span className="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums">
                {index + 1}
              </span>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{stage.name}</span>
                  <Badge variant="outline" className="font-normal capitalize">
                    {stage.kind}
                  </Badge>
                  {stage.requiresScorecard ? (
                    <Badge variant="secondary" className="font-normal">
                      {stage.minScorecards} scorecard{stage.minScorecards === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                  {stage.slaDays ? (
                    <span className="text-muted-foreground text-xs">
                      target {stage.slaDays} days
                    </span>
                  ) : null}
                </div>
                {stage.description ? (
                  <p className="text-muted-foreground text-sm">{stage.description}</p>
                ) : null}

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                  {(panels[stage.id] ?? []).length > 0 ? (
                    <span className="text-muted-foreground text-sm">
                      {(panels[stage.id] ?? []).map((p) => p.name).join(", ")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm italic">
                      No interviewers assigned — this stage will not hold
                      candidates up
                    </span>
                  )}
                  <StagePanelDialog
                    stageId={stage.id}
                    stageName={stage.name}
                    assigned={panels[stage.id] ?? []}
                    candidates={assignableInterviewers}
                  />
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${stage.name} earlier`}
                  disabled={busy || locked || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${stage.name} later`}
                  disabled={busy || locked || index === stages.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${stage.name}`}
                  disabled={busy}
                  onClick={() => setEditing(stage)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${stage.name}`}
                  disabled={busy || locked || stages.length <= 1}
                  onClick={() => setRemoving(stage)}
                >
                  <Trash2 />
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <Button variant="outline" disabled={busy || locked} onClick={() => setAdding(true)}>
        <Plus /> Add stage
      </Button>

      <Dialog open={adding} onOpenChange={(o) => { setAdding(o); if (!o) setDraft(EMPTY_STAGE); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a stage</DialogTitle>
            <DialogDescription>
              It is appended to the end of the pipeline; reorder it afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <StageFormFields value={draft} onChange={setDraft} idPrefix="new" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              disabled={busy || draft.name.trim().length < 2}
              onClick={async () => {
                const success = await run(
                  () => createStage({ positionId, ...draft }),
                  "Stage added",
                );
                if (success) { setAdding(false); setDraft(EMPTY_STAGE); }
              }}
            >
              Add stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit stage</DialogTitle>
            <DialogDescription>
              Changes apply to this position only.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <div className="my-4">
              <StageFormFields
                value={editing}
                onChange={(v) => setEditing({ ...editing, ...v })}
                idPrefix="edit"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={busy || (editing?.name.trim().length ?? 0) < 2}
              onClick={async () => {
                if (!editing) return;
                const { id, ...fields } = editing;
                const success = await run(
                  () => updateStage({ stageId: id, ...fields }),
                  "Stage updated",
                );
                if (success) setEditing(null);
              }}
            >
              Save stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The stage and its scoring criteria are deleted from this position.
              No other position is affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!removing) return;
                await run(() => deleteStage(removing.id), "Stage removed");
                setRemoving(null);
              }}
            >
              Remove stage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

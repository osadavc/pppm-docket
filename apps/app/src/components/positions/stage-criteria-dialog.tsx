"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, ListChecks, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createCriterion,
  reorderCriteria,
  setCriterionActive,
  updateCriterion,
} from "@/lib/actions/stages";

export type EditableCriterion = {
  id: string;
  label: string;
  description: string | null;
  weight: number;
  orderIndex: number;
  isActive: boolean;
};

type Draft = { label: string; description: string; weight: number };
const EMPTY: Draft = { label: "", description: "", weight: 1 };

/**
 * What a stage is scored on. Edits shape *future* scorecards only: every
 * submitted rating keeps the label and weight it was given against, so a
 * rename or re-weight here never rewrites an assessment already on file.
 */
export function StageCriteriaDialog({
  stageId,
  stageName,
  criteria,
}: {
  stageId: string;
  stageName: string;
  criteria: EditableCriterion[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<EditableCriterion | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const err = (name: string) =>
    fieldErrors[name]?.[0] ? [{ message: fieldErrors[name]![0]! }] : [];

  const active = criteria.filter((c) => c.isActive).sort((a, b) => a.orderIndex - b.orderIndex);
  const inactive = criteria.filter((c) => !c.isActive);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string[]> }>, done: string) {
    setBusy(true);
    setError(undefined);
    setFieldErrors({});
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return false;
    }
    toast.success(done);
    router.refresh();
    return true;
  }

  function startEdit(target: EditableCriterion | "new") {
    setEditing(target);
    setDraft(
      target === "new"
        ? EMPTY
        : { label: target.label, description: target.description ?? "", weight: target.weight },
    );
    setFieldErrors({});
    setError(undefined);
  }

  async function save() {
    const payload = { label: draft.label, description: draft.description || undefined, weight: draft.weight };
    const ok =
      editing === "new"
        ? await run(() => createCriterion({ stageId, ...payload }), `Added “${draft.label}”.`)
        : editing
          ? await run(() => updateCriterion({ criterionId: editing.id, ...payload }), `Updated “${draft.label}”.`)
          : false;
    if (ok) setEditing(null);
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...active];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    await run(
      () => reorderCriteria({ stageId, orderedCriterionIds: next.map((c) => c.id) }),
      "Criteria reordered.",
    );
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <ListChecks /> {active.length} criteri{active.length === 1 ? "on" : "a"}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setError(undefined); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Criteria for “{stageName}”</DialogTitle>
            <DialogDescription>
              What interviewers rate at this stage, 1–5 each, weighted 1–5.
              Changes apply to feedback submitted from now on; existing ratings
              keep the label and weight they were given against.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {editing ? (
              <div className="space-y-3 rounded-lg border p-3">
                <Field data-invalid={!!fieldErrors.label}>
                  <FieldLabel htmlFor="criterion-label">Label</FieldLabel>
                  <Input
                    id="criterion-label"
                    value={draft.label}
                    maxLength={80}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    placeholder="e.g. System design"
                  />
                  <FieldError errors={err("label")} />
                </Field>
                <Field data-invalid={!!fieldErrors.description}>
                  <FieldLabel htmlFor="criterion-description">Description</FieldLabel>
                  <Textarea
                    id="criterion-description"
                    rows={2}
                    maxLength={500}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                  <FieldDescription>Optional guidance shown under the rating.</FieldDescription>
                </Field>
                <Field data-invalid={!!fieldErrors.weight}>
                  <FieldLabel htmlFor="criterion-weight">Weight</FieldLabel>
                  <Select value={String(draft.weight)} onValueChange={(v) => setDraft({ ...draft, weight: Number(v) })}>
                    <SelectTrigger id="criterion-weight" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((w) => (
                        <SelectItem key={w} value={String(w)}>{w}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={err("weight")} />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={save} disabled={busy || draft.label.trim().length < 2}>
                    {busy ? "Saving…" : editing === "new" ? "Add criterion" : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => startEdit("new")} disabled={busy}>
                <Plus /> Add criterion
              </Button>
            )}

            {active.length === 0 && inactive.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No criteria yet. Interviewers can still submit a recommendation and
                narrative for this stage; add criteria to score it.
              </p>
            ) : null}

            {active.length > 0 ? (
              <ol className="divide-y rounded-lg border">
                {active.map((c, index) => (
                  <li key={c.id} className="flex items-start gap-3 p-3">
                    <span className="text-muted-foreground mt-0.5 w-5 text-xs tabular-nums">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {c.label}{" "}
                        <Badge variant="secondary" className="ml-1 font-normal">×{c.weight}</Badge>
                      </p>
                      {c.description ? (
                        <p className="text-muted-foreground text-xs">{c.description}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button variant="ghost" size="icon" aria-label={`Move ${c.label} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Move ${c.label} down`} disabled={busy || index === active.length - 1} onClick={() => move(index, 1)}>
                        <ArrowDown />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Edit ${c.label}`} disabled={busy} onClick={() => startEdit(c)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Deactivate ${c.label}`}
                        disabled={busy}
                        onClick={() => run(() => setCriterionActive({ criterionId: c.id, isActive: false }), `“${c.label}” deactivated. Past ratings are kept.`)}
                      >
                        <EyeOff />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}

            {inactive.length > 0 ? (
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Deactivated</p>
                <ul className="divide-y rounded-lg border opacity-70">
                  {inactive.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 p-3 text-sm">
                      <span className="min-w-0 flex-1 truncate line-through">{c.label}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => run(() => setCriterionActive({ criterionId: c.id, isActive: true }), `“${c.label}” reactivated.`)}
                      >
                        <Eye /> Reactivate
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { setStageInterviewers } from "@/lib/actions/stages";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { StagePanelMember } from "@/lib/queries/stage-interviewers";

export function StagePanelDialog({
  stageId,
  stageName,
  assigned,
  candidates,
}: {
  stageId: string;
  stageName: string;
  assigned: StagePanelMember[];
  candidates: StagePanelMember[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(assigned.map((a) => a.userId));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  function toggle(userId: string, checked: boolean) {
    setSelected((prev) =>
      checked ? [...new Set([...prev, userId])] : prev.filter((id) => id !== userId),
    );
  }

  async function save() {
    setPending(true);
    setError(undefined);
    const result = await setStageInterviewers({ stageId, userIds: selected });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(
      selected.length === 0
        ? `${stageName} has no assigned interviewers`
        : `${selected.length} interviewer${selected.length === 1 ? "" : "s"} on ${stageName}`,
    );
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setSelected(assigned.map((a) => a.userId));
          setOpen(true);
        }}
      >
        {assigned.length === 0 ? <UserPlus /> : <Users />}
        {assigned.length === 0
          ? "Assign interviewers"
          : `${assigned.length} interviewer${assigned.length === 1 ? "" : "s"}`}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(undefined); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Interviewers for “{stageName}”</DialogTitle>
            <DialogDescription>
              They can see every candidate on this position, and this stage waits
              on their feedback before a candidate advances.
            </DialogDescription>
          </DialogHeader>

          <div className="my-2 space-y-3">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <ScrollArea className="h-64 rounded-md border">
              <div className="space-y-1 p-2">
                {candidates.map((person) => (
                  <Label
                    key={person.userId}
                    htmlFor={`panel-${stageId}-${person.userId}`}
                    className="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-md p-2 font-normal"
                  >
                    <Checkbox
                      id={`panel-${stageId}-${person.userId}`}
                      className="mt-0.5"
                      checked={selected.includes(person.userId)}
                      onCheckedChange={(c) => toggle(person.userId, c === true)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{person.name}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {person.jobTitle || ROLE_LABELS[person.role]}
                      </span>
                    </span>
                  </Label>
                ))}
              </div>
            </ScrollArea>

            {selected.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                With nobody assigned, this stage will not hold candidates up.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save panel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { format } from "date-fns";
import { CalendarPlus, Check, Clock, Link2, MapPin, Phone, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cancelInterview, completeInterview, scheduleInterview } from "@/lib/actions/interviews";
import type { InterviewView } from "@/lib/queries/interviews";
import { cn } from "@/lib/utils";
import { INTERVIEW_MODE_LABELS } from "@/lib/validation/interview";
import {
  InterviewFields,
  draftErrors,
  newInterviewDraft,
  toScheduleInput,
  type InterviewPerson,
} from "./interview-fields";

const MODE_ICONS = { video: Video, phone: Phone, onsite: MapPin } as const;

const ScheduleDialog = ({
  applicationId,
  stageName,
  people,
  defaultInterviewerIds,
}: {
  applicationId: string;
  stageName: string;
  people: InterviewPerson[];
  defaultInterviewerIds: string[];
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [draft, setDraft] = useState(() => newInterviewDraft(defaultInterviewerIds));

  const submit = () => {
    const missing = draftErrors(draft);
    setErrors(missing);
    if (Object.keys(missing).length > 0) return;
    startTransition(async () => {
      const result = await scheduleInterview(toScheduleInput(applicationId, draft));
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success("Interview scheduled. The chosen interviewers now review this candidate.");
      setOpen(false);
      setDraft(newInterviewDraft(defaultInterviewerIds));
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarPlus /> Schedule interview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule {stageName}</DialogTitle>
          <DialogDescription>
            The people you choose become this candidate&apos;s panel for {stageName}, in place of
            the stage&apos;s usual interviewers.
          </DialogDescription>
        </DialogHeader>
        <InterviewFields idPrefix="interview" stageName={stageName} draft={draft} onChange={setDraft} people={people} errors={errors} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Scheduling…" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CancelButton = ({ interviewId }: { interviewId: string }) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="xs"
      variant="ghost"
      className="text-muted-foreground"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Cancel this interview? The stage's usual panel will review this candidate again.")) return;
        startTransition(async () => {
          const result = await cancelInterview({ interviewId });
          if (!result.ok) toast.error(result.error);
          else router.refresh();
        });
      }}
    >
      <X /> Cancel
    </Button>
  );
};

const DoneButton = ({ interviewId, feedbackHref }: { interviewId: string; feedbackHref: string | null }) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await completeInterview(interviewId);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Marked as done.");
          if (feedbackHref) router.push(feedbackHref);
          else router.refresh();
        })
      }
    >
      <Check /> Mark as done
    </Button>
  );
};

export const InterviewsPanel = ({
  applicationId,
  stageName,
  applicationStageId,
  interviews,
  people,
  standingPanelIds,
  canManage,
  viewerId,
  feedbackHref,
}: {
  applicationId: string;
  stageName: string | null;
  applicationStageId: string | null;
  interviews: InterviewView[];
  people: InterviewPerson[];
  standingPanelIds: string[];
  canManage: boolean;
  viewerId: string;
  feedbackHref: string | null;
}) => {
  const current = interviews.filter((i) => i.applicationStageId === applicationStageId && i.status !== "cancelled");
  const others = interviews.filter((i) => !current.includes(i));
  const canSchedule = canManage && stageName !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Interviews</CardTitle>
        <CardDescription>
          {current.length > 0
            ? `Booked for ${stageName}. Only the people on it review this stage.`
            : stageName
              ? `Nothing booked for ${stageName}, so the stage's usual panel reviews this candidate.`
              : "No interviews."}
        </CardDescription>
        {canSchedule ? (
          <CardAction>
            <ScheduleDialog
              applicationId={applicationId}
              stageName={stageName!}
              people={people}
              defaultInterviewerIds={standingPanelIds}
            />
          </CardAction>
        ) : null}
      </CardHeader>
      {interviews.length > 0 ? (
        <CardContent>
          <ul className="divide-y">
            {[...current, ...others].map((i) => {
              const Icon = MODE_ICONS[i.mode];
              const cancelled = i.status === "cancelled";
              return (
                <li key={i.id} className={cn("flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0", cancelled && "opacity-60")}>
                  <div className="bg-muted flex size-11 shrink-0 flex-col items-center justify-center rounded-lg leading-none">
                    <span className="text-muted-foreground text-[10px] font-medium uppercase">{format(i.scheduledAt, "MMM")}</span>
                    <span className="text-base font-semibold tabular-nums">{format(i.scheduledAt, "d")}</span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{i.title || i.stageName}</span>
                      {cancelled ? <Badge variant="outline" className="font-normal">Cancelled</Badge> : null}
                      {i.status === "completed" ? (
                        <Badge variant="outline" className="text-positive border-positive/30 font-normal">
                          <Check /> Done
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1"><Clock className="size-3" />{format(i.scheduledAt, "EEE, h:mm a")} · {i.durationMinutes} min</span>
                      <span className="inline-flex items-center gap-1"><Icon className="size-3" />{INTERVIEW_MODE_LABELS[i.mode]}{i.location ? `, ${i.location}` : ""}</span>
                      {i.meetingUrl && !cancelled ? (
                        <a href={i.meetingUrl} target="_blank" rel="noreferrer" className="hover:text-foreground inline-flex items-center gap-1 underline underline-offset-2">
                          <Link2 className="size-3" /> Join link
                        </a>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {i.participants.map((p) => (
                        <Badge key={p.userId} variant="secondary" className="font-normal">
                          {p.name}
                          {p.role === "lead" ? <span className="text-muted-foreground"> · lead</span> : null}
                        </Badge>
                      ))}
                    </div>
                    {i.notesForInterviewers ? <p className="text-muted-foreground pt-0.5 text-xs">{i.notesForInterviewers}</p> : null}
                  </div>
                  {i.status === "scheduled" && (canManage || i.participants.some((p) => p.userId === viewerId)) ? (
                    <div className="flex items-center gap-1">
                      <DoneButton interviewId={i.id} feedbackHref={i.applicationStageId === applicationStageId ? feedbackHref : null} />
                      {canManage && i.applicationStageId === applicationStageId ? <CancelButton interviewId={i.id} /> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
};

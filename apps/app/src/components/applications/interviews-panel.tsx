"use client";

import { format } from "date-fns";
import { CalendarPlus, Clock, Link2, MapPin, Phone, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/app/date-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cancelInterview, scheduleInterview } from "@/lib/actions/interviews";
import type { InterviewView } from "@/lib/queries/interviews";
import { cn } from "@/lib/utils";
import { INTERVIEW_MODE_LABELS, INTERVIEW_MODES } from "@/lib/validation/interview";

type Person = { id: string; name: string; jobTitle: string | null };

const MODE_ICONS = { video: Video, phone: Phone, onsite: MapPin } as const;
const DURATIONS: Record<number, string> = { 30: "30 minutes", 45: "45 minutes", 60: "1 hour", 90: "1.5 hours", 120: "2 hours" };

const ScheduleDialog = ({
  applicationId,
  stageName,
  people,
  defaultInterviewerIds,
}: {
  applicationId: string;
  stageName: string;
  people: Person[];
  defaultInterviewerIds: string[];
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(60);
  const [mode, setMode] = useState<(typeof INTERVIEW_MODES)[number]>("video");
  const [where, setWhere] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [chosen, setChosen] = useState<string[]>(defaultInterviewerIds);
  const [leadId, setLeadId] = useState<string>("");

  const toggle = (id: string, on: boolean) => {
    setChosen((current) => (on ? [...current, id] : current.filter((x) => x !== id)));
    if (!on && leadId === id) setLeadId("");
  };

  const submit = () => {
    setErrors({});
    if (!date) {
      setErrors({ scheduledAt: ["Pick a date"] });
      return;
    }
    startTransition(async () => {
      const result = await scheduleInterview({
        applicationId,
        title: title || undefined,
        scheduledAt: new Date(`${date}T${time}`).toISOString(),
        durationMinutes: duration,
        mode,
        location: mode === "onsite" ? where : undefined,
        meetingUrl: mode === "video" ? where : undefined,
        notesForInterviewers: notes || undefined,
        interviewerIds: chosen,
        leadId: leadId || undefined,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success("Interview scheduled. The chosen interviewers now review this candidate.");
      setOpen(false);
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

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field data-invalid={!!errors.scheduledAt}>
              <FieldLabel htmlFor="interview-date">Date</FieldLabel>
              <DatePicker id="interview-date" value={date} onChange={setDate} disablePast />
              <FieldError errors={errors.scheduledAt?.map((message) => ({ message }))} />
            </Field>
            <Field>
              <FieldLabel htmlFor="interview-time">Time</FieldLabel>
              <Input id="interview-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Length</FieldLabel>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DURATIONS).map(([d, label]) => (
                    <SelectItem key={d} value={d}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Format</FieldLabel>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVIEW_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {INTERVIEW_MODE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {mode !== "phone" ? (
            <Field data-invalid={!!(errors.meetingUrl || errors.location)}>
              <FieldLabel htmlFor="interview-where">{mode === "video" ? "Meeting link" : "Room or address"}</FieldLabel>
              <Input
                id="interview-where"
                value={where}
                onChange={(e) => setWhere(e.target.value)}
                placeholder={mode === "video" ? "https://meet.google.com/…" : "Level 3, Meeting room B"}
              />
              <FieldError errors={(errors.meetingUrl ?? errors.location)?.map((message) => ({ message }))} />
            </Field>
          ) : null}

          <Field data-invalid={!!errors.interviewerIds}>
            <FieldLabel>Interviewers</FieldLabel>
            <div className="max-h-52 divide-y overflow-y-auto rounded-lg border">
              {people.map((p) => {
                const on = chosen.includes(p.id);
                return (
                  <div key={p.id} className={cn("flex items-center gap-3 px-3 py-2", on && "bg-muted/40")}>
                    <Checkbox id={`iv-${p.id}`} checked={on} onCheckedChange={(v) => toggle(p.id, v === true)} />
                    <label htmlFor={`iv-${p.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                      <span className="block truncate">{p.name}</span>
                      {p.jobTitle ? <span className="text-muted-foreground block truncate text-xs">{p.jobTitle}</span> : null}
                    </label>
                    {on ? (
                      <button
                        type="button"
                        onClick={() => setLeadId(leadId === p.id ? "" : p.id)}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs transition-colors",
                          leadId === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {leadId === p.id ? "Lead" : "Make lead"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <FieldDescription>
              {chosen.length} selected. Each one is asked for a scorecard.
            </FieldDescription>
            <FieldError errors={errors.interviewerIds?.map((message) => ({ message }))} />
          </Field>

          <Field>
            <FieldLabel htmlFor="interview-title">Title (optional)</FieldLabel>
            <Input id="interview-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${stageName} with the team`} />
          </Field>

          <Field>
            <FieldLabel htmlFor="interview-notes">Notes for interviewers (optional)</FieldLabel>
            <Textarea id="interview-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Focus on system design; skip the take-home discussion." />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || chosen.length === 0}>
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

export const InterviewsPanel = ({
  applicationId,
  stageName,
  applicationStageId,
  interviews,
  people,
  standingPanelIds,
  canManage,
}: {
  applicationId: string;
  stageName: string | null;
  applicationStageId: string | null;
  interviews: InterviewView[];
  people: Person[];
  standingPanelIds: string[];
  canManage: boolean;
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
                  {canManage && !cancelled && i.applicationStageId === applicationStageId ? <CancelButton interviewId={i.id} /> : null}
                </li>
              );
            })}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
};

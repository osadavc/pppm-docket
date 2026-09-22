"use client";

import { DatePicker } from "@/components/app/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  INTERVIEW_MODE_LABELS,
  INTERVIEW_MODES,
  type ScheduleInterviewInput,
} from "@/lib/validation/interview";

export type InterviewPerson = { id: string; name: string; jobTitle: string | null };

export type InterviewDraft = {
  date: string;
  time: string;
  duration: number;
  mode: (typeof INTERVIEW_MODES)[number];
  where: string;
  title: string;
  notes: string;
  interviewerIds: string[];
  leadId: string;
};

export const newInterviewDraft = (interviewerIds: string[]): InterviewDraft => ({
  date: "",
  time: "10:00",
  duration: 60,
  mode: "video",
  where: "",
  title: "",
  notes: "",
  interviewerIds,
  leadId: "",
});

export const draftErrors = (draft: InterviewDraft): Record<string, string[]> => ({
  ...(draft.date ? {} : { scheduledAt: ["Pick a date"] }),
  ...(draft.interviewerIds.length > 0 ? {} : { interviewerIds: ["Choose at least one interviewer"] }),
});

export const toScheduleInput = (
  applicationId: string,
  draft: InterviewDraft,
): ScheduleInterviewInput => ({
  applicationId,
  title: draft.title || undefined,
  scheduledAt: new Date(`${draft.date}T${draft.time}`).toISOString(),
  durationMinutes: draft.duration,
  mode: draft.mode,
  location: draft.mode === "onsite" ? draft.where : undefined,
  meetingUrl: draft.mode === "video" ? draft.where : undefined,
  notesForInterviewers: draft.notes || undefined,
  interviewerIds: draft.interviewerIds,
  leadId: draft.leadId || undefined,
});

const DURATIONS: Record<number, string> = { 30: "30 minutes", 45: "45 minutes", 60: "1 hour", 90: "1.5 hours", 120: "2 hours" };

const asErrors = (messages?: string[]) => messages?.map((message) => ({ message }));

export const InterviewFields = ({
  idPrefix,
  stageName,
  draft,
  onChange,
  people,
  errors = {},
}: {
  idPrefix: string;
  stageName: string;
  draft: InterviewDraft;
  onChange: (draft: InterviewDraft) => void;
  people: InterviewPerson[];
  errors?: Record<string, string[] | undefined>;
}) => {
  const set = <K extends keyof InterviewDraft>(key: K, value: InterviewDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const toggle = (id: string, on: boolean) =>
    onChange({
      ...draft,
      interviewerIds: on ? [...draft.interviewerIds, id] : draft.interviewerIds.filter((x) => x !== id),
      leadId: !on && draft.leadId === id ? "" : draft.leadId,
    });

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Field data-invalid={!!errors.scheduledAt}>
          <FieldLabel htmlFor={`${idPrefix}-date`}>Date</FieldLabel>
          <DatePicker id={`${idPrefix}-date`} value={draft.date} onChange={(v) => set("date", v)} disablePast />
          <FieldError errors={asErrors(errors.scheduledAt)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-time`}>Time</FieldLabel>
          <Input id={`${idPrefix}-time`} type="time" value={draft.time} onChange={(e) => set("time", e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Length</FieldLabel>
          <Select value={String(draft.duration)} onValueChange={(v) => set("duration", Number(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DURATIONS).map(([minutes, label]) => (
                <SelectItem key={minutes} value={minutes}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Format</FieldLabel>
          <Select value={draft.mode} onValueChange={(v) => set("mode", v as InterviewDraft["mode"])}>
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

      {draft.mode !== "phone" ? (
        <Field data-invalid={!!(errors.meetingUrl || errors.location)}>
          <FieldLabel htmlFor={`${idPrefix}-where`}>{draft.mode === "video" ? "Meeting link" : "Room or address"}</FieldLabel>
          <Input
            id={`${idPrefix}-where`}
            value={draft.where}
            onChange={(e) => set("where", e.target.value)}
            placeholder={draft.mode === "video" ? "https://meet.google.com/…" : "Level 3, Meeting room B"}
          />
          <FieldError errors={asErrors(errors.meetingUrl ?? errors.location)} />
        </Field>
      ) : null}

      <Field data-invalid={!!errors.interviewerIds}>
        <FieldLabel>Interviewers</FieldLabel>
        <div className="max-h-52 divide-y overflow-y-auto rounded-lg border">
          {people.map((p) => {
            const on = draft.interviewerIds.includes(p.id);
            return (
              <div key={p.id} className={cn("flex items-center gap-3 px-3 py-2", on && "bg-muted/40")}>
                <Checkbox id={`${idPrefix}-iv-${p.id}`} checked={on} onCheckedChange={(v) => toggle(p.id, v === true)} />
                <label htmlFor={`${idPrefix}-iv-${p.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                  <span className="block truncate">{p.name}</span>
                  {p.jobTitle ? <span className="text-muted-foreground block truncate text-xs">{p.jobTitle}</span> : null}
                </label>
                {on ? (
                  <button
                    type="button"
                    onClick={() => set("leadId", draft.leadId === p.id ? "" : p.id)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs transition-colors",
                      draft.leadId === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {draft.leadId === p.id ? "Lead" : "Make lead"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <FieldDescription>{draft.interviewerIds.length} selected. Each one is asked for a scorecard.</FieldDescription>
        <FieldError errors={asErrors(errors.interviewerIds)} />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-title`}>Title (optional)</FieldLabel>
        <Input id={`${idPrefix}-title`} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder={`${stageName} with the team`} />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes for interviewers (optional)</FieldLabel>
        <Textarea id={`${idPrefix}-notes`} rows={3} value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Focus on system design; skip the take-home discussion." />
      </Field>
    </div>
  );
};

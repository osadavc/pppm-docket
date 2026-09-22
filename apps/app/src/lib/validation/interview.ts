import { z } from "zod";

export const INTERVIEW_MODES = ["video", "phone", "onsite"] as const;

export const INTERVIEW_MODE_LABELS: Record<(typeof INTERVIEW_MODES)[number], string> = {
  video: "Video call",
  phone: "Phone",
  onsite: "On site",
};

export const scheduleInterviewSchema = z
  .object({
    applicationId: z.uuid(),
    title: z.string().trim().max(120).optional(),
    scheduledAt: z.iso.datetime({ offset: true, message: "Pick a date and time" }),
    durationMinutes: z.number().int().min(15).max(480),
    mode: z.enum(INTERVIEW_MODES),
    location: z.string().trim().max(200).optional(),
    meetingUrl: z.union([z.literal(""), z.url("Enter a full link, including https://")]).optional(),
    notesForInterviewers: z.string().trim().max(2000).optional(),
    interviewerIds: z
      .array(z.string().min(1))
      .min(1, "Choose at least one interviewer")
      .max(10, "Ten interviewers at most"),
    leadId: z.string().optional(),
  })
  .refine((v) => !v.leadId || v.interviewerIds.includes(v.leadId), {
    message: "The lead must be one of the interviewers",
    path: ["leadId"],
  });

export type ScheduleInterviewInput = z.infer<typeof scheduleInterviewSchema>;

export const cancelInterviewSchema = z.object({
  interviewId: z.uuid(),
  reason: z.string().trim().max(500).optional(),
});

export type CancelInterviewInput = z.infer<typeof cancelInterviewSchema>;

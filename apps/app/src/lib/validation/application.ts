import { z } from "zod";

export const advanceApplicationSchema = z.object({
  applicationId: z.uuid(),
  note: z.string().trim().max(2000).optional(),
  /**
   * Present only when HR is deliberately moving someone past an unsatisfied
   * feedback gate. Required in that case so the reason is on the record.
   */
  overrideReason: z.string().trim().max(2000).optional(),
});

export type AdvanceApplicationInput = z.infer<typeof advanceApplicationSchema>;

import { z } from "zod";

export const PAGE_SIZE = 25;

/**
 * The filter state lives in the URL, which is what makes it survive
 * navigation: a link, the back button and a refresh all restore the same view
 * without any client state to lose.
 */
export const candidateSearchSchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  positionId: z.string().optional().default(""),
  stageId: z.string().optional().default(""),
  status: z
    .enum(["active", "hired", "rejected", "on_hold", "withdrawn"])
    .optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
});

export type CandidateSearch = z.infer<typeof candidateSearchSchema>;

/** Parses untrusted searchParams, falling back to defaults rather than erroring. */
export function parseCandidateSearch(
  input: Record<string, string | string[] | undefined>,
): CandidateSearch {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const parsed = candidateSearchSchema.safeParse({
    q: first(input.q),
    positionId: first(input.positionId),
    stageId: first(input.stageId),
    status: first(input.status) || undefined,
    page: first(input.page) || undefined,
  });
  return parsed.success
    ? parsed.data
    : { q: "", positionId: "", stageId: "", status: undefined, page: 1 };
}

export function buildCandidateQuery(search: Partial<CandidateSearch>) {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.positionId) params.set("positionId", search.positionId);
  if (search.stageId) params.set("stageId", search.stageId);
  if (search.status) params.set("status", search.status);
  if (search.page && search.page > 1) params.set("page", String(search.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const APPLICATION_STATUS_LABELS = {
  active: "Active",
  hired: "Hired",
  rejected: "Rejected",
  on_hold: "On hold",
  withdrawn: "Withdrawn",
} as const;

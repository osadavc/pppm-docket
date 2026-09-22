import { z } from "zod";
import type { CandidateSearch } from "./candidate-search";

export const POSITION_OUTCOME_FILTERS = ["on_hold", "hired", "rejected"] as const;
export type PositionOutcomeFilter = (typeof POSITION_OUTCOME_FILTERS)[number];

const schema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  stage: z.string().optional().default(""),
  // Unknown values become "no filter" rather than failing the whole parse,
  // so a bad status never throws away a valid page number.
  status: z.preprocess(
    (v) => (POSITION_OUTCOME_FILTERS.includes(v as PositionOutcomeFilter) ? v : undefined),
    z.enum(POSITION_OUTCOME_FILTERS).optional(),
  ),
  page: z.preprocess(
    (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
    },
    z.number().int(),
  ),
});

export type PositionCandidateFilter = z.infer<typeof schema>;

/**
 * `?stage=` and `?status=` are mutually exclusive pills: a stage filter
 * clears the outcome and vice versa. Unknown stage ids (checked against the
 * live stages by the caller) and unknown statuses fall back to "All".
 */
export function parsePositionCandidateFilter(
  input: Record<string, string | string[] | undefined>,
  liveStageIds: readonly string[],
): PositionCandidateFilter {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const parsed = schema.safeParse({
    q: first(input.q),
    stage: first(input.stage),
    status: first(input.status) || undefined,
    page: first(input.page) || undefined,
  });
  const value = parsed.success
    ? parsed.data
    : { q: "", stage: "", status: undefined, page: 1 };
  const stage = liveStageIds.includes(value.stage) ? value.stage : "";
  return { ...value, stage, status: stage ? undefined : value.status };
}

export function buildPositionCandidateQuery(filter: Partial<PositionCandidateFilter>) {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.stage) params.set("stage", filter.stage);
  else if (filter.status) params.set("status", filter.status);
  if (filter.page && filter.page > 1) params.set("page", String(filter.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Translate into the shared candidate search the global list already runs. */
export function toCandidateSearch(
  positionId: string,
  filter: PositionCandidateFilter,
): CandidateSearch {
  return {
    q: filter.q,
    positionId,
    stageId: filter.stage,
    status: filter.status,
    page: filter.page,
  };
}

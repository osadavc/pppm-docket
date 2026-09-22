import { z } from "zod";
import type { PositionStatus } from "@/db/schema/enums";

export const POSITION_STATUS_PILLS: Array<{ status: PositionStatus; label: string }> = [
  { status: "draft", label: "Draft" },
  { status: "pending_approval", label: "Pending" },
  { status: "open", label: "Open" },
  { status: "on_hold", label: "On hold" },
  { status: "filled", label: "Filled" },
  { status: "cancelled", label: "Cancelled" },
  { status: "closed", label: "Closed" },
];

const statuses = POSITION_STATUS_PILLS.map((p) => p.status);

export type PositionListSearch = {
  q: string;
  status: PositionStatus | undefined;
  page: number;
};

/** Untrusted searchParams → a safe filter; each field falls back on its own. */
export function parsePositionListSearch(
  input: Record<string, string | string[] | undefined>,
): PositionListSearch {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = z.string().trim().max(80).safeParse(first(input.q) ?? "");
  const status = first(input.status);
  const page = Number(first(input.page));
  return {
    q: q.success ? q.data : (first(input.q) ?? "").trim().slice(0, 80),
    status: statuses.includes(status as PositionStatus) ? (status as PositionStatus) : undefined,
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

export function buildPositionListQuery(search: Partial<PositionListSearch>) {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.status) params.set("status", search.status);
  if (search.page && search.page > 1) params.set("page", String(search.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

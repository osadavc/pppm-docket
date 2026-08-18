import type { PositionStatus } from "@/db/schema/enums";

export const POSITION_STATUS_LABELS: Record<PositionStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  open: "Open",
  on_hold: "On hold",
  closed: "Closed",
  filled: "Filled",
  cancelled: "Cancelled",
};

/**
 * The position lifecycle, as a single explicit map.
 *
 * The rule this exists to enforce: **draft can never reach open directly.**
 * A role must pass through `pending_approval` so management signs it off
 * before it is advertised. Expressing that as data rather than as an `if`
 * buried in one action means every future status change is checked against
 * the same table, and adding a transition is a visible edit here.
 */
export const ALLOWED_TRANSITIONS: Record<PositionStatus, readonly PositionStatus[]> = {
  // Note the deliberate absence of "open".
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["open", "draft", "cancelled"],
  open: ["on_hold", "closed", "filled", "cancelled"],
  on_hold: ["open", "closed", "cancelled"],
  // Reviving an ended role starts it over as a draft — it must be approved
  // again before it can be advertised a second time.
  closed: ["draft"],
  filled: ["closed"],
  cancelled: ["draft"],
};

export function canTransition(from: PositionStatus, to: PositionStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionError(from: PositionStatus, to: PositionStatus) {
  if (from === "draft" && to === "open") {
    return "A draft cannot be opened directly — it must be approved by management first.";
  }
  return `A position cannot move from ${POSITION_STATUS_LABELS[from]} to ${POSITION_STATUS_LABELS[to]}.`;
}

/** Outcomes that end a position's life and stamp closedAt. */
export const TERMINAL_STATUSES = ["filled", "closed", "cancelled"] as const;
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export function isTerminalStatus(s: PositionStatus): s is TerminalStatus {
  return (TERMINAL_STATUSES as readonly PositionStatus[]).includes(s);
}

/**
 * The single definition of "visible to candidates". Both the public careers
 * queries and the application guard derive from this, so a position can never
 * be advertised somewhere it cannot be applied to, or vice versa.
 */
export function isPubliclyVisible(status: PositionStatus) {
  return status === "open";
}

export function acceptsApplications(status: PositionStatus) {
  return isPubliclyVisible(status);
}

export const TERMINAL_STATUS_COPY: Record<
  TerminalStatus,
  { label: string; description: string }
> = {
  filled: {
    label: "Filled",
    description: "The role was hired into and the search is over.",
  },
  closed: {
    label: "Closed",
    description: "The search ended without completing every hire.",
  },
  cancelled: {
    label: "Cancelled",
    description: "The role was withdrawn before hiring anyone.",
  },
};

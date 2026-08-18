import type { PositionStatus } from "@/db/schema/enums";

export const POSITION_STATUS_LABELS: Record<PositionStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  open: "Open",
  on_hold: "On hold",
  closed: "Closed",
  filled: "Filled",
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
  draft: ["pending_approval"],
  pending_approval: ["open", "draft"],
  open: ["on_hold", "closed", "filled"],
  on_hold: ["open", "closed"],
  closed: ["draft"],
  filled: ["closed"],
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

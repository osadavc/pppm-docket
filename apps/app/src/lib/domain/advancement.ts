/**
 * The feedback gate.
 *
 * Pure and dependency-free so it can be reasoned about and tested directly, and
 * so the same rule drives both the UI (why the advance button is disabled) and
 * the server action that will actually move a candidate. The action must
 * re-evaluate this against live rows — a disabled button is not a guard.
 */
export type StageGateInput = {
  /** Position-level master switch. */
  requireFeedbackToAdvance: boolean;
  /** Stage-level switch. */
  requiresScorecard: boolean;
  /** How many of the assigned panel must have submitted. */
  minScorecards: number;
  /** Size of the standing panel for this stage. */
  assignedInterviewerCount: number;
  /** Scorecards actually submitted for this candidate at this stage. */
  submittedScorecardCount: number;
};

export type StageGate = {
  blocked: boolean;
  /** How many submissions are needed before this stage clears. */
  required: number;
  outstanding: number;
  reason:
    | "position_gate_disabled"
    | "stage_needs_no_feedback"
    | "no_interviewers_assigned"
    | "feedback_outstanding"
    | "satisfied";
};

export function evaluateStageGate(input: StageGateInput): StageGate {
  const {
    requireFeedbackToAdvance,
    requiresScorecard,
    minScorecards,
    assignedInterviewerCount,
    submittedScorecardCount,
  } = input;

  const clear = (reason: StageGate["reason"]): StageGate => ({
    blocked: false,
    required: 0,
    outstanding: 0,
    reason,
  });

  if (!requireFeedbackToAdvance) return clear("position_gate_disabled");
  if (!requiresScorecard) return clear("stage_needs_no_feedback");

  // Nobody is accountable for assessing this stage, so there is no feedback to
  // wait for. Blocking here would strand candidates behind an empty panel —
  // the gate exists to enforce accountability, not to punish its absence.
  if (assignedInterviewerCount === 0) return clear("no_interviewers_assigned");

  // Never demand more submissions than there are people who could give them.
  const required = Math.min(minScorecards, assignedInterviewerCount);
  if (required <= 0) return clear("stage_needs_no_feedback");

  const outstanding = Math.max(0, required - submittedScorecardCount);
  return outstanding > 0
    ? { blocked: true, required, outstanding, reason: "feedback_outstanding" }
    : { blocked: false, required, outstanding: 0, reason: "satisfied" };
}

export const GATE_EXPLANATIONS: Record<StageGate["reason"], string> = {
  position_gate_disabled: "This position does not require feedback before advancing.",
  stage_needs_no_feedback: "This stage does not require a scorecard.",
  no_interviewers_assigned:
    "No interviewers are assigned to this stage, so there is no feedback to wait for.",
  feedback_outstanding: "Waiting on interview feedback.",
  satisfied: "All required feedback is in.",
};

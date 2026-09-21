import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { evaluateStageGate } from "./advancement";

const base = {
  requireFeedbackToAdvance: true,
  requiresScorecard: true,
  minScorecards: 1,
  assignedInterviewerCount: 2,
  submittedScorecardCount: 0,
};

describe("evaluateStageGate", () => {
  test("one eligible submission clears a one-scorecard gate", () => {
    assert.deepEqual(
      evaluateStageGate({ ...base, submittedScorecardCount: 1 }),
      {
        blocked: false,
        required: 1,
        outstanding: 0,
        reason: "satisfied",
      },
    );
  });

  test("a two-scorecard gate waits for the second panel member", () => {
    assert.deepEqual(
      evaluateStageGate({
        ...base,
        minScorecards: 2,
        submittedScorecardCount: 1,
      }),
      {
        blocked: true,
        required: 2,
        outstanding: 1,
        reason: "feedback_outstanding",
      },
    );
  });

  test("panel changes reduce the requirement to the current assignment count", () => {
    const afterUnassigningOneSubmittedAuthor = evaluateStageGate({
      ...base,
      minScorecards: 2,
      assignedInterviewerCount: 1,
      submittedScorecardCount: 1,
    });

    assert.equal(afterUnassigningOneSubmittedAuthor.required, 1);
    assert.equal(afterUnassigningOneSubmittedAuthor.blocked, false);
  });

  test("an empty panel bypasses the gate", () => {
    assert.deepEqual(
      evaluateStageGate({
        ...base,
        minScorecards: 2,
        assignedInterviewerCount: 0,
      }),
      {
        blocked: false,
        required: 0,
        outstanding: 0,
        reason: "no_interviewers_assigned",
      },
    );
  });

  test("position and stage switches independently bypass feedback", () => {
    assert.equal(
      evaluateStageGate({ ...base, requireFeedbackToAdvance: false }).reason,
      "position_gate_disabled",
    );
    assert.equal(
      evaluateStageGate({ ...base, requiresScorecard: false }).reason,
      "stage_needs_no_feedback",
    );
  });
});

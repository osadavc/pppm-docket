import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { calculateWeightedScore } from "./scorecard";
import {
  NARRATIVE_REQUIRED_MESSAGE,
  scorecardSubmissionSchema,
} from "@/lib/validation/scorecard";

const applicationId = "00000000-0000-4000-8000-000000000001";

function submission(overrides: Record<string, unknown> = {}) {
  return {
    applicationId,
    intent: "submit",
    baseRevision: 0,
    recommendation: "yes",
    strengths: "Clear evidence from the interview.",
    concerns: "",
    notes: "",
    ratings: [],
    ...overrides,
  };
}

describe("scorecard submission", () => {
  test("accepts recommendation and narrative when a stage has no criteria", () => {
    assert.equal(
      scorecardSubmissionSchema.safeParse(submission()).success,
      true,
    );
  });

  test("requires one narrative field with at least 20 characters", () => {
    const result = scorecardSubmissionSchema.safeParse(
      submission({ strengths: "1234567890123456789" }),
    );

    assert.equal(result.success, false);
    if (result.success) return;
    assert.equal(
      result.error.issues.find((issue) => issue.path[0] === "narrative")
        ?.message,
      NARRATIVE_REQUIRED_MESSAGE,
    );
  });

  test("requires a recommendation and refuses draft intent", () => {
    const missingRecommendation = scorecardSubmissionSchema.safeParse(
      submission({ recommendation: null }),
    );
    assert.equal(missingRecommendation.success, false);

    const draft = scorecardSubmissionSchema.safeParse(
      submission({ intent: "draft" }),
    );
    assert.equal(draft.success, false);
  });

  test("calculates a weighted score rounded to two decimals", () => {
    assert.equal(
      calculateWeightedScore(
        [
          { id: "technical", weight: 2 },
          { id: "communication", weight: 1 },
        ],
        [
          { criterionId: "technical", rating: 4 },
          { criterionId: "communication", rating: 5 },
        ],
      ),
      4.33,
    );
    assert.equal(calculateWeightedScore([], []), null);
  });
});

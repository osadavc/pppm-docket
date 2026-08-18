import type { PositionStage, ScorecardCriterion } from "@/db/schema";

type StageSeed = Pick<
  PositionStage,
  "name" | "description" | "kind" | "requiresScorecard" | "minScorecards" | "slaDays"
> & {
  criteria: Array<Pick<ScorecardCriterion, "label" | "description" | "weight">>;
};

/**
 * The pipeline every new position starts with.
 *
 * These are COPIED into `position_stages` at creation rather than referenced,
 * so a position owns its pipeline from day one and can be reshaped without
 * touching any other position or invalidating feedback already given.
 *
 * If a stage template set is marked `isDefault`, that is copied instead — this
 * is the fallback so a position always gets a usable pipeline, even on a fresh
 * database with no templates configured.
 */
export const DEFAULT_STAGES: StageSeed[] = [
  {
    name: "Application Review",
    description: "Screen the CV against the essential requirements.",
    kind: "screening",
    // A CV screen is a yes/no call; demanding a full scorecard here would just
    // train people to click through it.
    requiresScorecard: false,
    minScorecards: 0,
    slaDays: 3,
    criteria: [],
  },
  {
    name: "Phone Screen",
    description: "Short call covering motivation, availability and salary.",
    kind: "interview",
    requiresScorecard: true,
    minScorecards: 1,
    slaDays: 5,
    criteria: [
      {
        label: "Communication",
        description: "Explains their experience clearly and listens well.",
        weight: 2,
      },
      {
        label: "Relevant experience",
        description: "Depth of experience against the essentials of this role.",
        weight: 3,
      },
      {
        label: "Motivation",
        description: "Clear reason for wanting this role specifically.",
        weight: 1,
      },
    ],
  },
  {
    name: "Team Interview",
    description: "Working session with the people they would work alongside.",
    kind: "interview",
    requiresScorecard: true,
    minScorecards: 2,
    slaDays: 7,
    criteria: [
      {
        label: "Problem solving",
        description: "Breaks problems down and reasons through trade-offs.",
        weight: 3,
      },
      {
        label: "Craft",
        description: "Quality and rigour of their work in this discipline.",
        weight: 3,
      },
      {
        label: "Collaboration",
        description: "Works with the interviewer rather than performing at them.",
        weight: 2,
      },
    ],
  },
  {
    name: "Hiring Manager Interview",
    description: "Final fit, expectations and growth conversation.",
    kind: "interview",
    requiresScorecard: true,
    minScorecards: 1,
    slaDays: 5,
    criteria: [
      {
        label: "Ownership",
        description: "Takes responsibility for outcomes, not just tasks.",
        weight: 3,
      },
      {
        label: "Values",
        description: "How they work with others under pressure.",
        weight: 2,
      },
    ],
  },
  {
    name: "Offer",
    description: "Approval, offer issued and accepted.",
    kind: "offer",
    requiresScorecard: false,
    minScorecards: 0,
    slaDays: 5,
    criteria: [],
  },
];

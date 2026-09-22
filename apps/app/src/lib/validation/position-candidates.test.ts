import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildPositionCandidateQuery,
  parsePositionCandidateFilter,
  toCandidateSearch,
} from "./position-candidates";

const stages = ["s1", "s2"];

describe("parsePositionCandidateFilter", () => {
  test("a stage pill clears the outcome pill", () => {
    const f = parsePositionCandidateFilter({ stage: "s1", status: "hired" }, stages);
    assert.equal(f.stage, "s1");
    assert.equal(f.status, undefined);
  });
  test("unknown stage and status are ignored", () => {
    const f = parsePositionCandidateFilter({ stage: "nope", status: "bogus", page: "3" }, stages);
    assert.equal(f.stage, "");
    assert.equal(f.status, undefined);
    assert.equal(f.page, 3);
  });
  test("outcome pill survives when no stage is given", () => {
    assert.equal(parsePositionCandidateFilter({ status: "on_hold" }, stages).status, "on_hold");
  });
  test("garbage page falls back to 1", () => {
    assert.equal(parsePositionCandidateFilter({ page: "-2" }, stages).page, 1);
  });
});

describe("buildPositionCandidateQuery / toCandidateSearch", () => {
  test("round-trips into the shared search with the position fixed", () => {
    const f = parsePositionCandidateFilter({ q: "nim", status: "rejected", page: "2" }, stages);
    assert.equal(buildPositionCandidateQuery(f), "?q=nim&status=rejected&page=2");
    assert.deepEqual(toCandidateSearch("pos", f), {
      q: "nim",
      positionId: "pos",
      stageId: "",
      status: "rejected",
      page: 2,
    });
  });
});

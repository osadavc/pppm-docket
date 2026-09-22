import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { daysInStage, PACE_THRESHOLDS, paceFor, paceLevel } from "./pace";

const DAY = 86_400_000;
const now = new Date("2026-09-22T12:00:00Z");

describe("paceLevel", () => {
  test("green below amberFrom, amber up to redFrom, red from redFrom", () => {
    assert.equal(paceLevel(0), "green");
    assert.equal(paceLevel(PACE_THRESHOLDS.amberFrom - 1), "green");
    assert.equal(paceLevel(PACE_THRESHOLDS.amberFrom), "amber");
    assert.equal(paceLevel(PACE_THRESHOLDS.redFrom - 1), "amber");
    assert.equal(paceLevel(PACE_THRESHOLDS.redFrom), "red");
    assert.equal(paceLevel(30), "red");
  });
});

describe("daysInStage / paceFor", () => {
  test("whole days elapsed, never negative, zero without an entry date", () => {
    assert.equal(daysInStage(new Date(now.getTime() - 2.9 * DAY), now), 2);
    assert.equal(daysInStage(new Date(now.getTime() + DAY), now), 0);
    assert.equal(daysInStage(null, now), 0);
  });
  test("labels read naturally", () => {
    assert.equal(paceFor(now, now).label, "Today");
    assert.equal(paceFor(new Date(now.getTime() - DAY), now).label, "1 day");
    assert.deepEqual(paceFor(new Date(now.getTime() - 7 * DAY), now), { days: 7, level: "red", label: "7 days" });
  });
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { acceptsApplications, applicationWindowClosed } from "./position-status";

const now = new Date("2026-09-22T12:00:00Z");
const tomorrow = new Date("2026-09-23T12:00:00Z");
const yesterday = new Date("2026-09-21T12:00:00Z");

describe("acceptsApplications", () => {
  test("open with no deadline accepts", () => {
    assert.equal(acceptsApplications("open", { deadline: null, now }), true);
    assert.equal(acceptsApplications("open"), true);
  });
  test("open with a future deadline accepts; a past one does not", () => {
    assert.equal(acceptsApplications("open", { deadline: tomorrow, now }), true);
    assert.equal(acceptsApplications("open", { deadline: yesterday, now }), false);
  });
  test("anything but open never accepts, deadline or not", () => {
    for (const status of ["draft", "pending_approval", "on_hold", "closed", "filled", "cancelled"] as const) {
      assert.equal(acceptsApplications(status, { deadline: tomorrow, now }), false);
    }
  });
  test("applicationWindowClosed is only true for a visible role past its deadline", () => {
    assert.equal(applicationWindowClosed("open", yesterday, now), true);
    assert.equal(applicationWindowClosed("open", tomorrow, now), false);
    assert.equal(applicationWindowClosed("closed", yesterday, now), false);
  });
});

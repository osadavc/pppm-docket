import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLOWED_TRANSITIONS, canTransition, isTerminalStatus, transitionError } from "./position-status";

describe("canTransition", () => {
  test("draft can never open directly — it must be approved first", () => {
    assert.equal(canTransition("draft", "open"), false);
    assert.equal(canTransition("draft", "pending_approval"), true);
    assert.equal(canTransition("pending_approval", "open"), true);
    assert.match(transitionError("draft", "open"), /approved by management/);
  });
  test("open can pause, close, fill or cancel; terminal states only revive as drafts", () => {
    for (const to of ["on_hold", "closed", "filled", "cancelled"] as const) assert.equal(canTransition("open", to), true);
    assert.equal(canTransition("closed", "open"), false);
    assert.equal(canTransition("closed", "draft"), true);
    assert.equal(canTransition("cancelled", "draft"), true);
    assert.equal(canTransition("filled", "closed"), true);
  });
  test("no status transitions to itself and terminal statuses are exactly filled/closed/cancelled", () => {
    for (const [from, tos] of Object.entries(ALLOWED_TRANSITIONS)) assert.ok(!tos.includes(from as never), from);
    assert.deepEqual(
      (["draft", "pending_approval", "open", "on_hold", "closed", "filled", "cancelled"] as const).filter(isTerminalStatus),
      ["closed", "filled", "cancelled"],
    );
  });
});

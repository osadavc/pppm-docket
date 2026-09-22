import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isUuid } from "./params";

describe("isUuid", () => {
  test("accepts v4 and v7 ids in either case", () => {
    assert.equal(isUuid("5f0c2d3a-1b2c-4d5e-8f90-1234567890ab"), true);
    assert.equal(isUuid("018F4C8A-9B2C-7D5E-AF90-1234567890AB"), true);
  });
  test("rejects malformed, partial, injected and non-string values", () => {
    for (const bad of ["", "abc", "5f0c2d3a-1b2c-4d5e-8f90-1234567890a", "5f0c2d3a1b2c4d5e8f901234567890ab", "5f0c2d3a-1b2c-4d5e-8f90-1234567890ab'; drop table x;--", 42, null, undefined, ["5f0c2d3a-1b2c-4d5e-8f90-1234567890ab"]]) {
      assert.equal(isUuid(bad), false, String(bad));
    }
  });
});

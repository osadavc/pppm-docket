import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isUuid, safeNextPath } from "./params";

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

describe("safeNextPath", () => {
  test("keeps same-site paths with their query and hash", () => {
    assert.equal(safeNextPath("/positions?status=open&q=Backend"), "/positions?status=open&q=Backend");
    assert.equal(safeNextPath("/applications/abc#emails"), "/applications/abc#emails");
  });
  test("falls back for off-site, protocol-relative and malformed targets", () => {
    for (const bad of ["https://evil.example/login", "//evil.example", "/\\evil.example", "/\\/evil.example", "javascript:alert(1)", "evil.example", "", undefined, ["/dashboard"]]) {
      assert.equal(safeNextPath(bad), "/dashboard", String(bad));
    }
  });
});

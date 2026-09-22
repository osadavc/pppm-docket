import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { groupByDepartment, openingsLine } from "./careers";

describe("openingsLine", () => {
  test("names the deadline when there is one", () => {
    assert.equal(
      openingsLine(3, new Date("2026-09-30T00:00:00Z")),
      "3 openings · apply by 30 Sep 2026",
    );
  });
  test("reads 'open until filled' without one, singular opening", () => {
    assert.equal(openingsLine(1, null), "1 opening · open until filled");
  });
});

describe("groupByDepartment", () => {
  test("buckets in first-seen order and keeps row order inside a bucket", () => {
    const groups = groupByDepartment([
      { department: "Engineering", title: "A" },
      { department: "Design", title: "B" },
      { department: "Engineering", title: "C" },
    ]);
    assert.deepEqual(
      groups.map((g) => [g.department, g.positions.map((p) => p.title)]),
      [
        ["Engineering", ["A", "C"]],
        ["Design", ["B"]],
      ],
    );
  });
  test("empty in, empty out", () => {
    assert.deepEqual(groupByDepartment([]), []);
  });
});

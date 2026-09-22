import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { customEmailSchema } from "./application";
import { publicApplicationSchema } from "./public-application";

describe("publicApplicationSchema", () => {
  const valid = {
    positionId: "5f0c2d3a-1b2c-4d5e-8f90-1234567890ab",
    fullName: " Pat Public ",
    email: " PAT@Example.COM ",
  };
  test("normalises email and trims the name", () => {
    const parsed = publicApplicationSchema.parse(valid);
    assert.equal(parsed.email, "pat@example.com");
    assert.equal(parsed.fullName, "Pat Public");
    assert.equal(parsed.salaryExpectation, undefined);
  });
  test("salary expectation is capped at 60 characters", () => {
    assert.equal(publicApplicationSchema.safeParse({ ...valid, salaryExpectation: "x".repeat(60) }).success, true);
    assert.equal(publicApplicationSchema.safeParse({ ...valid, salaryExpectation: "x".repeat(61) }).success, false);
  });
  test("refuses a bad email or short name", () => {
    assert.equal(publicApplicationSchema.safeParse({ ...valid, email: "nope" }).success, false);
    assert.equal(publicApplicationSchema.safeParse({ ...valid, fullName: "P" }).success, false);
  });
});

describe("customEmailSchema", () => {
  const base = { applicationId: "5f0c2d3a-1b2c-4d5e-8f90-1234567890ab" };
  test("subject 3–200, body 10–5000", () => {
    assert.equal(customEmailSchema.safeParse({ ...base, subject: "Hi", body: "x".repeat(10) }).success, false);
    assert.equal(customEmailSchema.safeParse({ ...base, subject: "Hey", body: "x".repeat(9) }).success, false);
    assert.equal(customEmailSchema.safeParse({ ...base, subject: "Hey", body: "x".repeat(10) }).success, true);
    assert.equal(customEmailSchema.safeParse({ ...base, subject: "x".repeat(201), body: "x".repeat(10) }).success, false);
    assert.equal(customEmailSchema.safeParse({ ...base, subject: "Hey", body: "x".repeat(5001) }).success, false);
  });
  test("subject must be one line", () => {
    assert.equal(customEmailSchema.safeParse({ ...base, subject: "a\nb", body: "x".repeat(10) }).success, false);
  });
});

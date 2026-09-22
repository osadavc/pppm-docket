import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applicationReceived,
  composeHtml,
  escapeHtml,
  rejection,
  stageAdvanced,
} from "./templates";

const context = {
  candidateName: "Nimal Perera",
  positionTitle: "Backend Engineer",
  companyName: "Acme",
};

describe("templates", () => {
  test("every template is plain text addressed by first name and signed by the company", () => {
    for (const draft of [
      applicationReceived(context),
      stageAdvanced({ ...context, nextStageName: "Phone Screen" }),
      rejection(context),
    ]) {
      assert.match(draft.body, /^Hi Nimal,/);
      assert.match(draft.body, /The Acme hiring team$/);
      assert.doesNotMatch(draft.body, /<[a-z]+>/i);
      assert.ok(draft.subject.length > 0);
    }
  });

  test("stageAdvanced names the next stage", () => {
    const draft = stageAdvanced({ ...context, nextStageName: "Phone Screen" });
    assert.match(draft.body, /moving forward to Phone Screen/);
  });

  test("greeting falls back when the name is blank", () => {
    assert.match(rejection({ ...context, candidateName: "  " }).body, /^Hi there,/);
  });
});

describe("composeHtml", () => {
  test("escapes &, < and >", () => {
    assert.equal(escapeHtml("a & b <c> d"), "a &amp; b &lt;c&gt; d");
    const html = composeHtml("<script>alert(1)</script> & co", "Acme");
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; co/);
  });

  test("a blank line starts a paragraph and a single newline is a <br/>", () => {
    const html = composeHtml("line one\nline two\n\nsecond paragraph", "Acme");
    const paragraphs = html.match(/<p[^>]*>/g) ?? [];
    assert.equal(paragraphs.length, 2);
    assert.match(html, /line one<br\/>line two/);
    assert.match(html, /<p[^>]*>second paragraph<\/p>/);
  });

  test("wraps the message in the branded shell with the company name escaped", () => {
    const html = composeHtml("Hello", "Smith & Co");
    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /Smith &amp; Co Hiring/);
    assert.doesNotMatch(html, /Acme/);
  });
});

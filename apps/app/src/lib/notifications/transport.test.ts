import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  logSimulatedEmail,
  planDelivery,
  sendThroughTransport,
  senderAddress,
  type EmailTransport,
  type OutboundMessage,
} from "./transport";

const message: OutboundMessage = {
  from: "Acme Hiring <hiring@acme.test>",
  to: "candidate@example.com",
  subject: "Your application",
  text: "Hi",
  html: "<p>Hi</p>",
  idempotencyKey: "notification/abc",
};

describe("planDelivery", () => {
  test("simulates when notifications are disabled, even with a key", () => {
    assert.deepEqual(
      planDelivery(
        { enabled: false, apiKeyConfigured: true, redirectTo: "" },
        "c@example.com",
      ),
      { mode: "simulated", to: "c@example.com", redirected: false, reason: "disabled" },
    );
  });

  test("simulates when no provider key is configured", () => {
    assert.equal(
      planDelivery(
        { enabled: true, apiKeyConfigured: false, redirectTo: "" },
        "c@example.com",
      ).mode,
      "simulated",
    );
  });

  test("DEMO_EMAIL_REDIRECT rewrites the recipient and flags it", () => {
    assert.deepEqual(
      planDelivery(
        { enabled: true, apiKeyConfigured: true, redirectTo: " inbox@dev.test " },
        "c@example.com",
      ),
      { mode: "provider", to: "inbox@dev.test", redirected: true },
    );
  });
});

describe("senderAddress", () => {
  test("builds “{company} Hiring <address>” from a bare address", () => {
    assert.equal(senderAddress("Acme", "hiring@acme.test"), "Acme Hiring <hiring@acme.test>");
  });

  test("takes only the address from a preformatted EMAIL_FROM", () => {
    assert.equal(
      senderAddress("Acme", "People Team <people@acme.test>"),
      "Acme Hiring <people@acme.test>",
    );
  });
});

describe("logSimulatedEmail", () => {
  test("logs the dev-console line", () => {
    const lines: string[] = [];
    logSimulatedEmail({ to: "c@example.com", subject: "Hello" }, (l) => lines.push(l));
    assert.deepEqual(lines, ["[email:simulated] to=c@example.com subject=Hello"]);
  });
});

describe("sendThroughTransport", () => {
  test("sent: passes the idempotency key and returns the provider id", async () => {
    const seen: unknown[] = [];
    const transport: EmailTransport = {
      send: async (payload, options) => {
        seen.push(payload, options);
        return { data: { id: "msg_1" }, error: null };
      },
    };
    const outcome = await sendThroughTransport(transport, message);
    assert.equal(outcome.kind, "sent");
    assert.equal(outcome.kind === "sent" && outcome.providerMessageId, "msg_1");
    assert.deepEqual(seen[1], { idempotencyKey: "notification/abc" });
    assert.ok(!("idempotencyKey" in (seen[0] as object)));
  });

  test("failed: a provider refusal is classified as failed, not unknown", async () => {
    const transport: EmailTransport = {
      send: async () => ({
        data: null,
        error: { name: "validation_error", message: "Invalid `to`", statusCode: 422 },
      }),
    };
    const outcome = await sendThroughTransport(transport, message);
    assert.equal(outcome.kind, "failed");
    assert.equal(outcome.kind === "failed" && outcome.message, "Invalid `to`");
    assert.equal(outcome.raw.statusCode, 422);
  });

  test("unknown: a thrown error never reads as a clean failure", async () => {
    const transport: EmailTransport = {
      send: async () => {
        throw new Error("socket hang up");
      },
    };
    const outcome = await sendThroughTransport(transport, message);
    assert.equal(outcome.kind, "unknown");
    assert.equal(outcome.kind === "unknown" && outcome.message, "socket hang up");
  });

  test("unknown: a provider timeout is an unknown outcome", async () => {
    const transport: EmailTransport = {
      send: () => new Promise(() => {}),
    };
    const outcome = await sendThroughTransport(transport, message, 20);
    assert.equal(outcome.kind, "unknown");
    assert.match(outcome.kind === "unknown" ? outcome.message : "", /did not respond within 20ms/);
  });
});

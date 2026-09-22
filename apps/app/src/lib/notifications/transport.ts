/**
 * The provider-facing half of the notification service, kept free of database
 * and framework imports so it can be unit tested with a stub transport.
 */
export type OutboundMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable per notification row; the provider dedupes retries on it. */
  idempotencyKey: string;
};

export type TransportError = {
  name?: string;
  message: string;
  code?: string;
  statusCode?: number | null;
};

/** Shaped like Resend's `emails.send` so the SDK client is a drop-in. */
export type EmailTransport = {
  send: (
    message: Omit<OutboundMessage, "idempotencyKey">,
    options: { idempotencyKey: string },
  ) => Promise<{
    data: { id: string } | null;
    error: TransportError | null;
  }>;
};

export type ProviderOutcome =
  | { kind: "sent"; providerMessageId: string | null; raw: Record<string, unknown> }
  /** The provider answered and refused. Safe to retry. */
  | { kind: "failed"; message: string; raw: Record<string, unknown> }
  /**
   * The call never returned a verdict (thrown, timed out). The message may or
   * may not have gone out, so a retry must reuse the idempotency key.
   */
  | { kind: "unknown"; message: string; raw: Record<string, unknown> };

export type DeliveryMode = {
  enabled: boolean;
  apiKeyConfigured: boolean;
  /** DEMO_EMAIL_REDIRECT, every recipient is rewritten to this inbox. */
  redirectTo: string;
};

export type DeliveryPlan =
  | { mode: "simulated"; to: string; redirected: boolean; reason: "disabled" | "no_api_key" }
  | { mode: "provider"; to: string; redirected: boolean };

/** Decide whether a message leaves the building, and to which address. */
export function planDelivery(
  mode: DeliveryMode,
  recipientEmail: string,
): DeliveryPlan {
  const redirectTo = mode.redirectTo.trim();
  const to = redirectTo || recipientEmail;
  const redirected = Boolean(redirectTo) && redirectTo !== recipientEmail;

  if (!mode.enabled) return { mode: "simulated", to, redirected, reason: "disabled" };
  if (!mode.apiKeyConfigured) {
    return { mode: "simulated", to, redirected, reason: "no_api_key" };
  }
  return { mode: "provider", to, redirected };
}

/**
 * `"Acme Hiring <hiring@acme.com>"`. EMAIL_FROM is meant to be a bare address;
 * one written as `Name <address>` (the pre-company-name format) contributes
 * only its address so the display name always comes from the company.
 */
export function senderAddress(companyName: string, emailFrom: string) {
  const address = emailFrom.match(/<([^>]+)>/)?.[1]?.trim() ?? emailFrom.trim();
  return `${companyName.trim()} Hiring <${address}>`;
}

export function logSimulatedEmail(
  message: Pick<OutboundMessage, "to" | "subject">,
  log: (line: string) => void = console.info,
) {
  log(`[email:simulated] to=${message.to} subject=${message.subject}`);
}

export const PROVIDER_TIMEOUT_MS = 15_000;

/**
 * Hand one message to the provider and classify what came back. A thrown
 * error or a timeout is reported as `unknown`, never as `failed`: the caller
 * must not treat it as "safe to send a fresh copy".
 */
export async function sendThroughTransport(
  transport: EmailTransport,
  message: OutboundMessage,
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<ProviderOutcome> {
  const { idempotencyKey, ...payload } = message;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      transport.send(payload, { idempotencyKey }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Provider did not respond within ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);

    if (result.error) {
      return {
        kind: "failed",
        message: result.error.message,
        raw: {
          provider: "resend",
          outcome: "failed",
          name: result.error.name ?? null,
          code: result.error.code ?? null,
          statusCode: result.error.statusCode ?? null,
          message: result.error.message,
        },
      };
    }

    return {
      kind: "sent",
      providerMessageId: result.data?.id ?? null,
      raw: { provider: "resend", outcome: "sent", id: result.data?.id ?? null },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown email provider error";
    return {
      kind: "unknown",
      message,
      raw: { provider: "resend", outcome: "unknown", message },
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

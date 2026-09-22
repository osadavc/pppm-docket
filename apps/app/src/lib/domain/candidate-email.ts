/**
 * Shared vocabulary between the decision dialogs and the notification service.
 * The templates themselves live in `lib/notifications/templates`.
 */
export type CandidateEmailDraft = {
  subject: string;
  body: string;
};

/** What the caller learns about the candidate email after a decision commits. */
export type CandidateEmailDeliveryStatus =
  | "not_requested"
  | "queued"
  | "simulated"
  | "sent"
  | "failed"
  /** The provider was contacted but never answered; see the Emails panel. */
  | "unknown";

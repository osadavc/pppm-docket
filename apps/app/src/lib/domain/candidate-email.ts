export type CandidateEmailDraft = {
  subject: string;
  body: string;
};

export type CandidateEmailDeliveryStatus =
  | "not_requested"
  | "queued"
  | "demo"
  | "sent"
  | "failed";

type CandidateEmailContext = {
  candidateName: string;
  positionTitle: string;
};

function greetingName(candidateName: string) {
  return candidateName.trim().split(/\s+/)[0] || "there";
}

export function advancementEmailTemplate(
  context: CandidateEmailContext & { nextStageName: string },
): CandidateEmailDraft {
  return {
    subject: `Your application for ${context.positionTitle}`,
    body: `Hi ${greetingName(context.candidateName)},

Thank you for your time so far. We’re pleased to let you know that your application for ${context.positionTitle} is moving forward to ${context.nextStageName}.

We’ll be in touch with the next steps.

Best,
The hiring team`,
  };
}

export function rejectionEmailTemplate(
  context: CandidateEmailContext,
): CandidateEmailDraft {
  return {
    subject: `An update on your application for ${context.positionTitle}`,
    body: `Hi ${greetingName(context.candidateName)},

Thank you for the time and care you put into your application for ${context.positionTitle}.

After careful consideration, we won’t be moving forward with your application. We appreciate your interest in joining us and wish you the best in your search.

Best,
The hiring team`,
  };
}

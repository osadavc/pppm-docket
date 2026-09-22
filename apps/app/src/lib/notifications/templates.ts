/**
 * Candidate-facing email templates.
 *
 * Pure functions with no server imports so the dialogs can prefill an editable
 * preview on the client and the server can render the same text for the
 * record. Each returns plain text: HR edits plain text, the audit row stores
 * plain text, and `composeHtml` derives the HTML alternative at dispatch.
 */
export type EmailTemplate = {
  subject: string;
  body: string;
};

export type TemplateContext = {
  candidateName: string;
  positionTitle: string;
  companyName: string;
};

function greetingName(candidateName: string) {
  return candidateName.trim().split(/\s+/)[0] || "there";
}

function signOff(companyName: string) {
  return `Best,\nThe ${companyName} hiring team`;
}

export function applicationReceived(context: TemplateContext): EmailTemplate {
  return {
    subject: `We received your application for ${context.positionTitle}`,
    body: `Hi ${greetingName(context.candidateName)},

Thanks for applying for ${context.positionTitle} at ${context.companyName}. Your application is with the hiring team, and we’ll be in touch as soon as we have reviewed it.

${signOff(context.companyName)}`,
  };
}

export function stageAdvanced(
  context: TemplateContext & { nextStageName: string },
): EmailTemplate {
  return {
    subject: `Your application for ${context.positionTitle}`,
    body: `Hi ${greetingName(context.candidateName)},

Thank you for your time so far. We’re pleased to let you know that your application for ${context.positionTitle} is moving forward to ${context.nextStageName}.

We’ll be in touch with the next steps.

${signOff(context.companyName)}`,
  };
}

export function rejection(context: TemplateContext): EmailTemplate {
  return {
    subject: `An update on your application for ${context.positionTitle}`,
    body: `Hi ${greetingName(context.candidateName)},

Thank you for the time and care you put into your application for ${context.positionTitle}.

After careful consideration, we won’t be moving forward with your application. We appreciate your interest in joining ${context.companyName} and wish you the best in your search.

${signOff(context.companyName)}`,
  };
}

export function hired(context: TemplateContext): EmailTemplate {
  return {
    subject: `Welcome to ${context.companyName}: your offer for ${context.positionTitle}`,
    body: `Hi ${greetingName(context.candidateName)},

We’re delighted to let you know that we’d like you to join ${context.companyName} as ${context.positionTitle}. Everyone you met was impressed, and we’re excited to work with you.

We’ll be in touch shortly with your offer letter and the details of your start date.

${signOff(context.companyName)}`,
  };
}

export function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Plain text → HTML: a blank line separates paragraphs, a single newline is a
 * line break, and everything HR typed is escaped before it touches markup.
 */
export type EmailBrand = {
  careersUrl?: string;
  /** Inbox preview line; defaults to the start of the message. */
  preheader?: string;
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function composeHtml(text: string, companyName = "Docket", brand: EmailBrand = {}) {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px 0;">${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("\n");
  const company = escapeHtml(companyName);
  const initial = escapeHtml(companyName.trim().charAt(0).toUpperCase() || "D");
  const preheader = escapeHtml(
    brand.preheader ?? normalized.split(/\n{2,}/)[1]?.replace(/\s+/g, " ").slice(0, 140) ?? "",
  );

  const mark = `<div style="width:32px;height:32px;background:#18181b;border-radius:8px;color:#ffffff;font-size:14px;font-weight:600;line-height:32px;text-align:center;">${initial}</div>`;

  const careersLink = brand.careersUrl
    ? `<a href="${escapeHtml(brand.careersUrl)}" style="color:#52525b;text-decoration:underline;text-underline-offset:3px;">View open roles</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <style>@media (max-width: 480px) { .px { padding-left: 22px !important; padding-right: 22px !important; } .outer { padding: 24px 12px !important; } }</style>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:${FONT};color:#18181b;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
      <tr>
        <td class="outer" align="center" style="padding:48px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;">
            <tr>
              <td class="px" style="padding:24px 36px;border-bottom:1px solid #f0f0f2;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td valign="middle">${mark}</td>
                    <td valign="middle" style="padding-left:12px;font-size:15px;font-weight:600;letter-spacing:-0.01em;color:#18181b;">${company} Hiring</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="px" style="padding:32px 36px 18px 36px;font-size:15px;line-height:1.7;color:#3f3f46;">
${paragraphs}
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td align="center" style="padding:24px 16px 0 16px;font-size:12px;line-height:1.6;color:#a1a1aa;">
                Sent by the ${company} hiring team about your application.${careersLink ? `<br/>${careersLink}` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

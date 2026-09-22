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

export function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Plain text → HTML: a blank line separates paragraphs, a single newline is a
 * line break, and everything HR typed is escaped before it touches markup.
 */
export function composeHtml(text: string, companyName = "Docket") {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px 0;">${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("\n");
  const company = escapeHtml(companyName);
  const initial = escapeHtml(companyName.trim().charAt(0).toUpperCase() || "D");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
  </head>
  <body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 4px 20px 4px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;background:#18181b;border-radius:7px;color:#ffffff;font-size:13px;font-weight:600;line-height:28px;">${initial}</td>
                    <td style="padding-left:10px;font-size:14px;font-weight:600;letter-spacing:-0.01em;color:#18181b;">${company} Hiring</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e8e8eb;border-radius:12px;padding:36px 36px 20px 36px;font-size:15px;line-height:1.65;color:#27272a;">
${paragraphs}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 4px 0 4px;font-size:12px;line-height:1.5;color:#8b8b93;">
                Sent by the ${company} hiring team.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

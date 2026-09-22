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
        `<p style="margin:0 0 16px 0;">${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e4e4e7;">
      <tr>
        <td style="padding:20px 28px;border-bottom:1px solid #e4e4e7;font-size:14px;font-weight:600;letter-spacing:0.02em;">
          ${escapeHtml(companyName)} Hiring
        </td>
      </tr>
      <tr>
        <td style="padding:28px;font-size:15px;line-height:1.6;">
${paragraphs}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">
          This message was sent by the ${escapeHtml(companyName)} hiring team.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

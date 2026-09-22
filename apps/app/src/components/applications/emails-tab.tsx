"use client";

import { ChevronDown, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ComposeEmailDialog } from "@/components/applications/compose-email-dialog";
import { retryNotification } from "@/lib/actions/notifications";
import { COMPANY_NAME, EMAIL_BRAND } from "@/lib/company";
import { formatDateTime } from "@/lib/format";
import { deliveryBadgeVariant, deliveryLabel } from "@/lib/notifications/labels";
import { composeHtml } from "@/lib/notifications/templates";
import type { ApplicationEmail } from "@/lib/queries/notifications";

const TYPE_LABELS: Record<ApplicationEmail["type"], string> = {
  application_received: "Application received",
  stage_advanced: "Stage advanced",
  rejection: "Rejection",
  decision_made: "Hired",
  custom: "Custom",
  interview_scheduled: "Interview scheduled",
  interview_rescheduled: "Interview rescheduled",
  interview_cancelled: "Interview cancelled",
  feedback_requested: "Feedback requested",
  account_invited: "Account invited",
};

function RetryButton({ email }: { email: ApplicationEmail }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function retry() {
    setPending(true);
    const result = await retryNotification({ notificationId: email.id });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.status === "sent") toast.success("Email sent.");
    else if (result.data.status === "simulated") {
      toast.success("Email recorded as simulated. Delivery is off.");
    } else if (result.data.status === "unknown") {
      toast.warning("The provider did not answer. Retry again to reconcile.");
    } else toast.error(`Email failed again${result.data.error ? `: ${result.data.error}` : "."}`);
    router.refresh();
  }

  return (
    <Button size="xs" variant="outline" onClick={retry} disabled={pending}>
      <RotateCw className={pending ? "animate-spin" : undefined} />
      {pending ? "Retrying…" : email.outcomeUnknown ? "Retry & reconcile" : "Retry"}
    </Button>
  );
}

function EmailRow({ email, canRetry }: { email: ApplicationEmail; canRetry: boolean }) {
  const retryable =
    canRetry && (email.status === "failed" || email.outcomeUnknown);

  return (
    <li className="border-b py-3 first:pt-0 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{email.subject}</p>
          <p className="text-muted-foreground text-xs">
            {TYPE_LABELS[email.type]} · to {email.recipientEmail}
            {email.actorName ? ` · by ${email.actorName}` : ""} ·{" "}
            {formatDateTime(email.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={deliveryBadgeVariant(email)}>{deliveryLabel(email)}</Badge>
          {retryable ? <RetryButton email={email} /> : null}
        </div>
      </div>

      {email.error ? (
        <p className="text-destructive mt-1 text-xs whitespace-pre-wrap">{email.error}</p>
      ) : null}
      {email.redirected && email.deliveryEmail ? (
        <p className="text-muted-foreground mt-1 text-xs">
          Redirected to {email.deliveryEmail}; the original address is kept on record.
        </p>
      ) : null}

      <Collapsible className="mt-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="xs">
            Preview · {email.attemptCount} attempt{email.attemptCount === 1 ? "" : "s"}
            {email.lastAttemptAt ? `, last ${formatDateTime(email.lastAttemptAt)}` : ""}
            <ChevronDown data-icon="inline-end" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {/* The rendered HTML is shown in a sandboxed frame with no
              permissions at all: no scripts, no navigation, no same-origin
              access. The body is HR-typed plain text run through the same
              escaping the provider receives, so what is previewed is what
              was sent. */}
          <iframe
            title={`Preview of “${email.subject}”`}
            sandbox=""
            srcDoc={composeHtml(email.body, COMPANY_NAME, EMAIL_BRAND)}
            className="bg-background mt-2 h-96 w-full rounded-md border"
          />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export function EmailsTab({
  applicationId,
  candidateName,
  candidateEmail,
  positionTitle,
  emails,
  canSend,
}: {
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  positionTitle: string;
  emails: ApplicationEmail[];
  /** HR only: compose, send and retry. Management reads the log. */
  canSend: boolean;
}) {
  return (
    <Card id="emails">
      <CardHeader>
        <CardTitle>Emails ({emails.length})</CardTitle>
        <CardDescription>
          Every message sent from this application, newest first, recorded
          before it was handed to the provider. A failed send never undoes the
          decision it announced.
        </CardDescription>
        {canSend ? (
          <CardAction>
            <ComposeEmailDialog
              applicationId={applicationId}
              candidateName={candidateName}
              candidateEmail={candidateEmail}
              positionTitle={positionTitle}
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {emails.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No emails have been sent from this application yet. This log records
            messages sent from here. Advancing or rejecting a candidate with
            “Email the candidate” turned on, and ad-hoc messages composed above.
          </p>
        ) : (
          <ul>
            {emails.map((email) => (
              <EmailRow key={email.id} email={email} canRetry={canSend} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

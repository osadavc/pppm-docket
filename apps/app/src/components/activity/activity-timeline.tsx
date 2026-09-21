import {
  ArrowRightLeft,
  ChevronDown,
  Mail,
  MessageSquareQuote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  CommunicationSnapshot,
  TimelineEntry,
  TimelineKind,
} from "@/lib/queries/activity";

const ICONS: Record<TimelineKind, LucideIcon> = {
  stage: ArrowRightLeft,
  feedback: MessageSquareQuote,
  email: Mail,
};

const TONES: Record<TimelineKind, string> = {
  stage: "bg-muted text-foreground",
  feedback: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  email: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

const KIND_LABELS: Record<TimelineKind, string> = {
  stage: "Stage change",
  feedback: "Feedback",
  email: "Email",
};

const DELIVERY_LABELS: Record<CommunicationSnapshot["status"], string> = {
  queued: "Queued",
  dispatching: "Dispatching",
  demo: "Demo",
  sent: "Sent",
  failed: "Failed",
};

function deliveryBadgeVariant(status: CommunicationSnapshot["status"]) {
  if (status === "failed") return "destructive" as const;
  if (status === "sent") return "default" as const;
  if (status === "demo" || status === "dispatching") {
    return "secondary" as const;
  }
  return "outline" as const;
}

function CommunicationDisclosure({
  communication,
}: {
  communication: CommunicationSnapshot;
}) {
  const hasDifferentDeliveryTarget =
    communication.deliveryEmail &&
    communication.deliveryEmail !== communication.recipientEmail;

  return (
    <Collapsible className="mt-3">
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="xs">
          Inspect message
          <ChevronDown
            data-icon="inline-end"
            className="transition-transform group-data-[state=open]/button:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Recorded message</CardTitle>
            <CardDescription>
              The rendered content retained before delivery was attempted.
            </CardDescription>
            <CardAction>
              <Badge variant={deliveryBadgeVariant(communication.status)}>
                {DELIVERY_LABELS[communication.status]}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-3 text-xs sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="text-muted-foreground font-medium uppercase">
                  Intended recipient
                </dt>
                <dd className="break-all">{communication.recipientEmail}</dd>
              </div>
              {hasDifferentDeliveryTarget ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <dt className="text-muted-foreground font-medium uppercase">
                    Delivery target
                  </dt>
                  <dd className="break-all">{communication.deliveryEmail}</dd>
                </div>
              ) : null}
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground font-medium uppercase">
                  Recorded
                </dt>
                <dd>{formatDateTime(communication.createdAt)}</dd>
              </div>
              {communication.lastAttemptAt ? (
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground font-medium uppercase">
                    Last attempt
                  </dt>
                  <dd>{formatDateTime(communication.lastAttemptAt)}</dd>
                </div>
              ) : null}
              {communication.sentAt ? (
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground font-medium uppercase">
                    {communication.status === "demo" ? "Demo outcome" : "Sent"}
                  </dt>
                  <dd>{formatDateTime(communication.sentAt)}</dd>
                </div>
              ) : null}
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground font-medium uppercase">
                  Attempts
                </dt>
                <dd>{communication.attemptCount}</dd>
              </div>
              {communication.providerMessageId ? (
                <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
                  <dt className="text-muted-foreground font-medium uppercase">
                    Provider reference
                  </dt>
                  <dd className="break-all font-mono">
                    {communication.providerMessageId}
                  </dd>
                </div>
              ) : null}
              {communication.error ? (
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <dt className="text-muted-foreground font-medium uppercase">
                    Delivery error
                  </dt>
                  <dd className="text-destructive whitespace-pre-wrap">
                    {communication.error}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="border-t pt-3">
              <p className="text-muted-foreground text-xs font-medium uppercase">
                Subject
              </p>
              <p className="mt-1 font-medium">{communication.subject}</p>
            </div>
            <div className="border-t pt-3">
              <p className="text-muted-foreground text-xs font-medium uppercase">
                Body
              </p>
              <p className="mt-1 break-words whitespace-pre-wrap">
                {communication.body}
              </p>
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ActivityTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card className="text-muted-foreground p-10 text-center text-sm">
        Nothing has happened on this application yet.
      </Card>
    );
  }

  return (
    <ol className="relative space-y-0">
      {entries.map((entry, index) => {
        const Icon = ICONS[entry.kind];
        const isLast = index === entries.length - 1;

        return (
          <li key={entry.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  TONES[entry.kind],
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              {/* The rail joins entries; it must not hang past the last one. */}
              {!isLast ? <span className="bg-border w-px flex-1" /> : null}
            </div>

            <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-6")}>
              <p className="text-sm">{entry.title}</p>
              {entry.detail ? (
                <p className="text-muted-foreground mt-0.5 text-sm whitespace-pre-wrap">
                  {entry.detail}
                </p>
              ) : null}
              <p className="text-muted-foreground mt-1 text-xs">
                <span className="sr-only">{KIND_LABELS[entry.kind]} — </span>
                {entry.actorName ? `${entry.actorName} · ` : ""}
                {formatDateTime(entry.at)}
              </p>
              {entry.communication ? (
                <CommunicationDisclosure communication={entry.communication} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

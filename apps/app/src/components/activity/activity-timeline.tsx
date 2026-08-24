import { ArrowRightLeft, Mail, MessageSquareQuote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TimelineEntry, TimelineKind } from "@/lib/queries/activity";

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

function when(at: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
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
                {when(entry.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

import { BadgeCheck, Send, Undo2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { ApprovalEvent } from "@/lib/queries/activity";

const COPY = {
  requested: { icon: Send, verb: "Requested by" },
  approved: { icon: BadgeCheck, verb: "Approved by" },
  sent_back: { icon: Undo2, verb: "Sent back by" },
} as const;

/**
 * The full approval story: every request and every decision, with the note
 * that came with it. The position row only remembers the latest decision;
 * this list is read from the activity log so earlier cycles stay visible.
 */
export function ApprovalHistory({ events }: { events: ApprovalEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval history</CardTitle>
        <CardDescription>Who asked, who decided, and what they said.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-muted-foreground text-sm">Not submitted yet.</p>
        ) : (
          <ol className="space-y-3">
            {events.map((event) => {
              const { icon: Icon, verb } = COPY[event.kind];
              return (
                <li key={event.id} className="flex gap-3 text-sm">
                  <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p>
                      {verb} <span className="font-medium">{event.actorName ?? "-"}</span>
                      <span className="text-muted-foreground"> · {formatDateTime(event.at)}</span>
                    </p>
                    {event.note ? (
                      <q className="text-muted-foreground mt-0.5 block whitespace-pre-wrap italic">
                        {event.note}
                      </q>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

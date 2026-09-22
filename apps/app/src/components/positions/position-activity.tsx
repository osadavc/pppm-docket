import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { PositionActivityRow } from "@/lib/queries/activity";

function noteLine(meta: Record<string, unknown> | null) {
  const note = meta?.note;
  return typeof note === "string" && note.trim() ? note.trim() : null;
}

/** The position's own audit trail, newest first. */
export function PositionActivity({ rows }: { rows: PositionActivityRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Position activity</CardTitle>
        <CardDescription>
          Creation, edits, approval, stage and panel changes, and closure.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing recorded yet.</p>
        ) : (
          <ol className="divide-y">
            {rows.map((row) => {
              const note = noteLine(row.meta);
              return (
                <li key={row.id} className="py-2 text-sm">
                  <p>{row.summary}</p>
                  {note ? (
                    <q className="text-muted-foreground block italic">{note}</q>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    {row.actorName ?? "System"} · {formatDateTime(row.at)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

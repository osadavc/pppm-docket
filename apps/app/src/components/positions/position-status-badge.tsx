import { Badge } from "@/components/ui/badge";
import type { PositionStatus } from "@/db/schema/enums";

const LABELS: Record<PositionStatus, string> = {
  draft: "Draft",
  open: "Open",
  on_hold: "On hold",
  closed: "Closed",
  filled: "Filled",
};

const VARIANTS: Record<PositionStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  open: "default",
  on_hold: "secondary",
  closed: "secondary",
  filled: "secondary",
};

export function PositionStatusBadge({ status }: { status: PositionStatus }) {
  return (
    <Badge variant={VARIANTS[status]} className="font-normal">
      {LABELS[status]}
    </Badge>
  );
}

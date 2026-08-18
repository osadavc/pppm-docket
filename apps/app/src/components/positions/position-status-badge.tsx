import { Badge } from "@/components/ui/badge";
import type { PositionStatus } from "@/db/schema/enums";
import { POSITION_STATUS_LABELS as LABELS } from "@/lib/domain/position-status";

const VARIANTS: Record<PositionStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  pending_approval: "secondary",
  open: "default",
  on_hold: "secondary",
  closed: "secondary",
  filled: "secondary",
  cancelled: "destructive",
};

export function PositionStatusBadge({ status }: { status: PositionStatus }) {
  return (
    <Badge variant={VARIANTS[status]} className="font-normal">
      {LABELS[status]}
    </Badge>
  );
}

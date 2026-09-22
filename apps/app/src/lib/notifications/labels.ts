import type { NotificationStatus } from "@/db/schema/enums";

/** Shared by the timeline (server) and the Emails panel (client). */
export const DELIVERY_LABELS: Record<NotificationStatus, string> = {
  queued: "Queued",
  dispatching: "Dispatching",
  simulated: "Simulated",
  sent: "Sent",
  failed: "Failed",
};

type DeliveryView = { status: NotificationStatus; outcomeUnknown: boolean };

export function deliveryLabel(view: DeliveryView) {
  return view.status === "dispatching" && view.outcomeUnknown
    ? "Outcome unknown"
    : DELIVERY_LABELS[view.status];
}

export function deliveryBadgeVariant(view: DeliveryView) {
  if (view.status === "failed" || view.outcomeUnknown) return "destructive" as const;
  if (view.status === "sent") return "default" as const;
  if (view.status === "simulated" || view.status === "dispatching") {
    return "secondary" as const;
  }
  return "outline" as const;
}

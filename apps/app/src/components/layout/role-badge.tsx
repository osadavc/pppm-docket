import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type UserRole } from "@/lib/auth/roles";

const VARIANTS: Record<UserRole, "default" | "secondary" | "outline"> = {
  hr: "default",
  management: "secondary",
  interviewer: "outline",
};

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge variant={VARIANTS[role]} className="font-normal">
      {ROLE_LABELS[role]}
    </Badge>
  );
}

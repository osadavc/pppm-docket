import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type UserRole } from "@/lib/auth/roles";

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge variant="outline" className="text-muted-foreground font-normal">
      {ROLE_LABELS[role]}
    </Badge>
  );
}

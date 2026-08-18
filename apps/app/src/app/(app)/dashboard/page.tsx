import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guards";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Dashboard · Docket" };

/**
 * Placeholder. Role-specific content (HR: open positions and stalled candidates;
 * Interviewer: agenda and outstanding feedback; Management: KPI tiles) arrives
 * with the tickets that create those queries.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {user.name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm">
          {ROLE_DESCRIPTIONS[user.role]}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Signed in as</CardDescription>
            <CardTitle className="text-xl">{ROLE_LABELS[user.role]}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {user.email}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

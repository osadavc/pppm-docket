import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guards";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/roles";
import { countOutstandingFeedback } from "@/lib/queries/queue";

export const metadata: Metadata = { title: "Dashboard · Docket" };

export default async function DashboardPage() {
  const user = await requireUser();
  const outstandingFeedback = await countOutstandingFeedback(user.id);

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

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <Card className="gap-0 py-0">
          <Link
            href="/queue"
            className="group grid gap-5 rounded-xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center"
          >
            <span className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-lg">
              <ClipboardCheck className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">My assigned work</span>
              <span className="text-muted-foreground mt-0.5 block text-sm">
                {outstandingFeedback === 0
                  ? "No active candidates are waiting on your feedback."
                  : `${outstandingFeedback} active ${outstandingFeedback === 1 ? "candidate is" : "candidates are"} waiting on your submitted scorecard.`}
              </span>
            </span>
            <span className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {outstandingFeedback}
              </span>
              <span className="text-muted-foreground text-xs font-medium uppercase">
                Outstanding
              </span>
            </span>
            <ArrowRight className="text-muted-foreground hidden size-5 transition-transform group-hover:translate-x-1 sm:block" />
          </Link>
        </Card>

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

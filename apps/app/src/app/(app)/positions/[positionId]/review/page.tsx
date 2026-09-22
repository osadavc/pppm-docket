import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReviewScreen } from "@/components/review/review-screen";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { getReviewQueue } from "@/lib/queries/pipeline";
import { parseUuidParam } from "@/lib/validation/params";

export const metadata: Metadata = { title: "Review · Docket" };

/**
 * HR and management may open the workspace (same visibility as the pipeline);
 * only HR gets the decision controls, and the server actions behind them
 * check again, so the keyboard shortcuts add no authority.
 */
export default async function ReviewPage({
  params,
}: PageProps<"/positions/[positionId]/review">) {
  const user = await requirePermission("position:view");
  const positionId = parseUuidParam((await params).positionId);
  const canDecide = can(user.role, "application:manage");

  const queue = await getReviewQueue(positionId, {
    includeSalary: can(user.role, "application:view"),
  });
  if (!queue) notFound();

  return (
    <>
      <div>
        <Link
          href={`/positions/${positionId}/pipeline`}
          className="text-muted-foreground mb-2 inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-3.5" /> {queue.position.title} · Pipeline
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Review {queue.stage ? `at ${queue.stage.name}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm">
          {queue.total} waiting, oldest first. CV on the left, decision on the right.
        </p>
      </div>

      <ReviewScreen
        queue={queue}
        canDecide={canDecide}
        canOverride={can(user.role, "application:override-gate")}
      />
    </>
  );
}

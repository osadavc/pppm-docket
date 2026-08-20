import type { Metadata } from "next";
import { CandidateForm } from "@/components/candidates/candidate-form";
import { requirePermission } from "@/lib/auth/guards";
import { listOpenPositionsForApplication } from "@/lib/queries/candidates";

export const metadata: Metadata = { title: "Add candidate · Docket" };

export default async function NewCandidatePage() {
  await requirePermission("candidate:manage");
  const positions = await listOpenPositionsForApplication();

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add a candidate</h1>
        <p className="text-muted-foreground text-sm">
          Referrals, walk-ins and CVs that arrived by email all enter the same
          pipeline here.
        </p>
      </div>

      <div className="max-w-3xl">
        <CandidateForm positions={positions} />
      </div>
    </>
  );
}

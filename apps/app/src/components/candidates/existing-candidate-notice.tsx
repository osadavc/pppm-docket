"use client";

import Link from "next/link";
import { UserCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { ExistingCandidate } from "@/lib/queries/candidates";
import { APPLICATION_STATUS_LABELS } from "@/lib/validation/candidate-search";

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "secondary",
  hired: "default",
  rejected: "destructive",
  on_hold: "outline",
  withdrawn: "outline",
};

function statusLabel(status: string) {
  return APPLICATION_STATUS_LABELS[status as keyof typeof APPLICATION_STATUS_LABELS] ?? status;
}

/**
 * Shown as soon as the email matches someone already on file. The point of
 * de-duplicating is that HR can see the prior history before adding them
 * again, rather than discovering it from an error afterwards.
 */
export function ExistingCandidateNotice({
  candidate,
  selectedPositionId,
}: {
  candidate: ExistingCandidate;
  selectedPositionId: string;
}) {
  const clash = candidate.applications.find(
    (a) => a.positionId === selectedPositionId,
  );

  return (
    <Alert variant={clash ? "destructive" : "default"}>
      <UserCheck />
      <AlertTitle>
        {candidate.fullName} is already on file
      </AlertTitle>
      <AlertDescription className="space-y-2">
        {clash ? (
          <span className="block">
            They are already on this position: {statusLabel(clash.status).toLowerCase()}
            {clash.stageName ? ` at ${clash.stageName}` : ""}. Choose a
            different position.
          </span>
        ) : (
          <span className="block">
            Their existing record will be reused, so no duplicate is created.
          </span>
        )}

        {candidate.applications.length > 0 ? (
          <span className="block space-y-1">
            <span className="text-xs font-medium">Applied before:</span>
            {candidate.applications.map((a) => (
              <span key={a.positionId} className="flex flex-wrap items-center gap-2 text-xs">
                <Link
                  href={`/positions/${a.positionId}`}
                  className="underline underline-offset-4"
                >
                  {a.positionTitle}
                </Link>
                {a.stageName ? (
                  <Badge variant="outline" className="font-normal">
                    {a.stageName}
                  </Badge>
                ) : null}
                {/* The outcome matters as much as the stage: a hired or
                    rejected application reads very differently from a live one. */}
                <Badge variant={STATUS_TONE[a.status] ?? "outline"} className="font-normal">
                  {statusLabel(a.status)}
                </Badge>
                <span className="opacity-80">{formatDate(a.appliedAt)}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="block text-xs">No previous applications.</span>
        )}

        <Link
          href={`/candidates/${candidate.id}`}
          className="block text-xs underline underline-offset-4"
        >
          Open their profile
        </Link>
      </AlertDescription>
    </Alert>
  );
}

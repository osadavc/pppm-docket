"use client";

import Link from "next/link";
import { UserCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { ExistingCandidate } from "@/lib/queries/candidates";

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
            They are already on this position, at{" "}
            <strong>{clash.stageName ?? clash.status}</strong>. Choose a
            different position.
          </span>
        ) : (
          <span className="block">
            Their existing record will be reused — no duplicate is created.
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
                <Badge variant="outline" className="font-normal">
                  {a.stageName ?? a.status}
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

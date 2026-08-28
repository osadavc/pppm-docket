import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdvanceButton } from "@/components/applications/advance-button";
import { FlowOverrideMenu } from "@/components/applications/flow-override-menu";
import { RejectDialog } from "@/components/applications/reject-dialog";
import { HireDialog } from "@/components/applications/hire-dialog";
import { getFillSummary } from "@/lib/queries/positions";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { getAdvanceContext } from "@/lib/queries/applications";
import { formatDate } from "@/lib/format";
import { getCandidate } from "@/lib/queries/candidates";
import { CANDIDATE_SOURCE_LABELS } from "@/lib/validation/candidate";

export const metadata: Metadata = { title: "Candidate · Docket" };

function fileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function CandidatePage({
  params,
  searchParams,
}: PageProps<"/candidates/[candidateId]">) {
  const { candidateId } = await params;
  if (!z.uuid().safeParse(candidateId).success) notFound();

  const user = await requirePermission("candidate:view");
  // Where the list was when they clicked through, so Back returns to the same
  // filtered page rather than an unfiltered one.
  const { from } = await searchParams;
  const backHref = `/candidates${typeof from === "string" ? from : ""}`;

  const candidate = await getCandidate(candidateId);
  if (!candidate) notFound();

  const canAdvance = can(user.role, "application:manage");
  const canOverrideFlow = can(user.role, "application:override-flow");
  const contexts = canAdvance || canOverrideFlow
    ? Object.fromEntries(
        (
          await Promise.all(
            candidate.applications.map(async (a) => [a.id, await getAdvanceContext(a.id)] as const),
          )
        ).filter(([, c]) => c !== null),
      )
    : {};

  // Hiring needs to know how the position stands against approved headcount,
  // so the dialog can warn before the fact and prompt to close out after.
  const fills = canAdvance
    ? Object.fromEntries(
        await Promise.all(
          candidate.applications
            .filter((a) => a.position?.id)
            .map(async (a) => [a.id, await getFillSummary(a.position!.id)] as const),
        ),
      )
    : {};

  const facts: Array<[string, string]> = [
    ["Email", candidate.email],
    ["Phone", candidate.phone || "—"],
    ["Location", candidate.location || "—"],
    ["Current role", candidate.currentTitle || "—"],
    ["Company", candidate.currentCompany || "—"],
    ["Source", CANDIDATE_SOURCE_LABELS[candidate.source]],
    ["Referred by", candidate.referredBy?.name ?? "—"],
    ["Added by", candidate.createdBy?.name ?? "—"],
    ["Added", formatDate(candidate.createdAt)],
  ];

  return (
    <>
      <div>
        <Link
          href={backHref}
          className="text-muted-foreground mb-2 inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-3.5" /> Back to candidates
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{candidate.fullName}</h1>
        <p className="text-muted-foreground text-sm">
          {candidate.currentTitle
            ? `${candidate.currentTitle}${candidate.currentCompany ? ` at ${candidate.currentCompany}` : ""}`
            : candidate.email}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Applications</CardTitle>
              <CardDescription>
                Where this person sits in each process they are part of.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {candidate.applications.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Not attached to a position yet.
                </p>
              ) : (
                candidate.applications.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <Link
                        href={`/positions/${a.position?.id}`}
                        className="font-medium hover:underline"
                      >
                        {a.position?.title}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        Applied {formatDate(a.appliedAt)} ·{" "}
                        <Link
                          href={`/applications/${a.id}`}
                          className="underline underline-offset-4"
                        >
                          History
                        </Link>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-normal">
                        {a.currentStage?.name ?? "—"}
                      </Badge>
                      <Badge variant="secondary" className="font-normal capitalize">
                        {a.status.replace("_", " ")}
                      </Badge>
                      {contexts[a.id] && canAdvance ? (
                        <AdvanceButton
                          context={contexts[a.id]!}
                          canOverride={can(user.role, "application:override-gate")}
                        />
                      ) : null}
                      {contexts[a.id] && fills[a.id] && canAdvance && a.status === "active" ? (
                        <HireDialog context={contexts[a.id]!} fill={fills[a.id]!} />
                      ) : null}
                      {contexts[a.id] && canAdvance && a.status === "active" ? (
                        <RejectDialog context={contexts[a.id]!} />
                      ) : null}
                      {contexts[a.id] && canOverrideFlow ? (
                        <FlowOverrideMenu context={contexts[a.id]!} />
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>
                Stored privately. Downloads are authorised per request and never
                served from a public link.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {candidate.attachments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No documents.</p>
              ) : (
                candidate.attachments.map((f) => (
                  <div
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="text-muted-foreground size-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{f.fileName}</p>
                        <p className="text-muted-foreground text-xs">
                          {f.kind.toUpperCase()} · {fileSize(f.sizeBytes)} ·{" "}
                          {formatDate(f.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/files/${f.id}`}>
                        <Download /> Download
                      </a>
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {candidate.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{candidate.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {facts.map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-4 border-b pb-2 last:border-0 last:pb-0"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="min-w-0 truncate text-right font-medium">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

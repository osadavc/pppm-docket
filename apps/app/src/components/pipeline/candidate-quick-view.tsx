"use client";

import { ArrowUpRight, Download, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ClickToCopy } from "@/components/app/click-to-copy";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getApplicationQuickView, type ApplicationQuickView } from "@/lib/actions/quick-view";
import { formatDate } from "@/lib/format";
import { CANDIDATE_SOURCE_LABELS } from "@/lib/validation/candidate";

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2 text-sm">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words">{children || <span className="text-muted-foreground">-</span>}</dd>
  </div>
);

const Details = ({ view }: { view: ApplicationQuickView }) => (
  <dl className="divide-y">
    <Row label="Email">
      <ClickToCopy value={view.email} label="Email" />
    </Row>
    <Row label="Phone">{view.phone ? <ClickToCopy value={view.phone} label="Phone" /> : null}</Row>
    <Row label="Location">{view.location}</Row>
    <Row label="Current title">{view.currentTitle}</Row>
    <Row label="Company">{view.currentCompany}</Row>
    <Row label="Salary">
      {view.canSeeSalary ? view.salaryExpectation : <span className="text-muted-foreground">Restricted</span>}
    </Row>
    <Row label="Source">
      {CANDIDATE_SOURCE_LABELS[view.source as keyof typeof CANDIDATE_SOURCE_LABELS] ?? view.source}
    </Row>
    <Row label="Applied">{formatDate(view.appliedAt)}</Row>
    <Row label="Added by">{view.addedBy ?? "Careers site"}</Row>
  </dl>
);

const CvPane = ({ view }: { view: ApplicationQuickView }) => {
  if (!view.cv) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-sm">
        <FileText className="size-6" />
        No CV attached
      </div>
    );
  }
  const url = `/api/files/${view.cv.attachmentId}`;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <FileText className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm">{view.cv.fileName}</span>
        {view.cv.isPdf ? (
          <Button asChild size="xs" variant="ghost">
            <a href={`${url}?inline=1`} target="_blank" rel="noreferrer">
              <ExternalLink /> Open
            </a>
          </Button>
        ) : null}
        <Button asChild size="xs" variant="ghost">
          <a href={url}>
            <Download /> Download
          </a>
        </Button>
      </div>
      {view.cv.isPdf ? (
        <iframe title={`CV: ${view.candidateName}`} src={`${url}?inline=1`} className="bg-muted/40 min-h-0 w-full flex-1" />
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-sm">
          This CV is a Word document, so it can&apos;t be previewed here. Download it to read it.
        </div>
      )}
    </div>
  );
};

export const CandidateQuickView = ({
  applicationId,
  fullName,
  subtitle,
  children,
  className,
}: {
  applicationId: string;
  fullName: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ApplicationQuickView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const result = await getApplicationQuickView(applicationId);
    if (result.ok) setView(result.data);
    else setError(result.error);
  };

  return (
    <>
      <Link
        href={`/applications/${applicationId}`}
        className={className}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          setOpen(true);
          if (!view) void load();
        }}
      >
        {children}
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-5xl">
          <SheetHeader className="border-b px-5 py-4 pr-12">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="truncate text-lg">{fullName}</SheetTitle>
                <SheetDescription className="truncate">{subtitle || "Candidate"}</SheetDescription>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href={`/applications/${applicationId}`}>
                  Full application <ArrowUpRight />
                </Link>
              </Button>
            </div>
          </SheetHeader>
          <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] md:grid-cols-[20rem_1fr] md:grid-rows-1">
            <div className="overflow-y-auto border-b px-5 py-3 md:border-r md:border-b-0">
              {view ? (
                <Details view={view} />
              ) : error ? (
                <p className="text-destructive py-2 text-sm">{error}</p>
              ) : (
                <div className="space-y-3 py-2">
                  {Array.from({ length: 7 }, (_, i) => (
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </div>
              )}
            </div>
            <div className="min-h-[60svh] md:min-h-0">
              {view ? <CvPane view={view} /> : error ? null : <Skeleton className="m-4 h-[calc(100%-2rem)] rounded-lg" />}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

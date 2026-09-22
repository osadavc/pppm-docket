import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { getPositionTitle } from "@/lib/queries/positions";
import { parseUuidParam } from "@/lib/validation/params";

export const metadata: Metadata = { title: "Application received · Docket Careers" };

/**
 * Deliberately not gated on the role still being open: the person just
 * applied, and closing the role a minute later must not turn their receipt
 * into a 404. Only a role that does not exist at all is not found.
 */
export default async function AppliedPage({
  params,
}: PageProps<"/careers/[positionId]/applied">) {
  const positionId = parseUuidParam((await params).positionId);
  const role = await getPositionTitle(positionId);
  if (!role) notFound();

  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 mx-auto flex size-12 items-center justify-center rounded-full">
        <CircleCheck className="size-6" aria-hidden />
      </span>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        Thanks, you&apos;re in the running for {role.title}.
      </h1>
      <p className="text-muted-foreground mt-3 text-sm">
        We have your application and CV. We read every application and will
        reply either way; if email is turned on for this site you will also
        receive a confirmation shortly.
      </p>
      <Link
        href={`/careers/${positionId}`}
        className="text-muted-foreground mt-8 inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-3.5" /> Back to the role
      </Link>
    </div>
  );
}

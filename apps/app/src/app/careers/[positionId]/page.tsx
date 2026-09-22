import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApplyForm } from "@/components/careers/apply-form";
import { acceptsApplications } from "@/lib/domain/position-status";
import { openingsLine } from "@/lib/domain/careers";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/format";
import { getPublicPosition } from "@/lib/queries/positions";
import { parseUuidParam } from "@/lib/validation/params";

export const metadata: Metadata = { title: "Role · Docket Careers" };

export default async function CareersRolePage({
  params,
}: PageProps<"/careers/[positionId]">) {
  const positionId = parseUuidParam((await params).positionId);

  // Returns nothing unless the position is open, so an unapproved role cannot
  // be reached even by guessing its id.
  const role = await getPublicPosition(positionId);
  if (!role) notFound();
  const open = acceptsApplications("open", { deadline: role.applicationDeadline });

  return (
    <>
      <Link
        href="/careers"
        className="text-muted-foreground mb-6 inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-3.5" /> All roles
      </Link>

      <h1 className="text-3xl font-semibold tracking-tight">{role.title}</h1>
      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="secondary" className="font-normal">
          {role.department}
        </Badge>
        {role.location ? (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" /> {role.location}
          </span>
        ) : null}
        <span>{EMPLOYMENT_TYPE_LABELS[role.employmentType]}</span>
        <span>{openingsLine(role.openings, role.applicationDeadline)}</span>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>About the role</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">
            {role.description || "Details to follow."}
          </p>
        </CardContent>
      </Card>

      {role.requirements ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>What we are looking for</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{role.requirements}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* The role stays visible after its deadline; only the form closes. The
          action re-checks the same rule, so a stale page cannot sneak one in. */}
      <Card className="mt-8" id="apply">
        <CardHeader>
          <CardTitle>Apply</CardTitle>
          {open ? (
            <CardDescription>
              Takes about two minutes. We read every application and reply
              either way.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {open ? (
            <ApplyForm positionId={role.id} />
          ) : (
            <p className="text-muted-foreground text-sm">
              The application window for this role has closed.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

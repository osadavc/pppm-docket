import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EMPLOYMENT_TYPE_LABELS, formatDate } from "@/lib/format";
import { getPublicPosition } from "@/lib/queries/positions";

export const metadata: Metadata = { title: "Role · Docket Careers" };

export default async function CareersRolePage({
  params,
}: PageProps<"/careers/[positionId]">) {
  const { positionId } = await params;

  // Returns nothing unless the position is open, so an unapproved role cannot
  // be reached even by guessing its id.
  const role = await getPublicPosition(positionId);
  if (!role) notFound();

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
        {role.applicationDeadline ? (
          <span>Closes {formatDate(role.applicationDeadline)}</span>
        ) : null}
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
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EMPLOYMENT_TYPE_LABELS, formatDate } from "@/lib/format";
import { listPublicPositions } from "@/lib/queries/positions";

export const metadata: Metadata = { title: "Careers · Docket" };

export default async function CareersPage() {
  // The only query permitted here — it filters to status = 'open', so drafts
  // and positions awaiting approval can never reach this page.
  const roles = await listPublicPositions();

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Open roles</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {roles.length === 0
            ? "No vacancies are open right now."
            : `${roles.length} role${roles.length === 1 ? "" : "s"} currently accepting applications.`}
        </p>
      </div>

      <div className="space-y-4">
        {roles.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>
                <Link href={`/careers/${r.id}`} className="hover:underline">
                  {r.title}
                </Link>
              </CardTitle>
              <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
                <Badge variant="secondary" className="font-normal">
                  {r.department}
                </Badge>
                {r.location ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" /> {r.location}
                  </span>
                ) : null}
                <span>{EMPLOYMENT_TYPE_LABELS[r.employmentType]}</span>
                {r.applicationDeadline ? (
                  <span>Closes {formatDate(r.applicationDeadline)}</span>
                ) : null}
              </div>
            </CardHeader>
            {r.description ? (
              <CardContent>
                <p className="text-muted-foreground line-clamp-3 text-sm">
                  {r.description}
                </p>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>
    </>
  );
}

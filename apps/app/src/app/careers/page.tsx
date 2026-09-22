import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DepartmentPills } from "@/components/careers/department-pills";
import { COMPANY_NAME } from "@/lib/company";
import { groupByDepartment, openingsLine } from "@/lib/domain/careers";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/format";
import { listPublicPositions } from "@/lib/queries/positions";

export const metadata: Metadata = { title: `Careers · ${COMPANY_NAME}` };

export default async function CareersPage({
  searchParams,
}: PageProps<"/careers">) {
  const { department } = await searchParams;
  const requested = typeof department === "string" ? department : "";

  // The only query permitted here, it filters to open roles with a live
  // deadline, so nothing unapproved or expired can reach this page.
  const roles = await listPublicPositions();
  const groups = groupByDepartment(roles);
  // An unknown department in the URL falls back to the full board rather
  // than an empty one.
  const selected = groups.some((g) => g.department === requested) ? requested : "";
  const visible = selected ? groups.filter((g) => g.department === selected) : groups;

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Open roles</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {roles.length === 0
            ? "Nothing open right now. Check back soon."
            : `${roles.length} role${roles.length === 1 ? "" : "s"} currently accepting applications at ${COMPANY_NAME}.`}
        </p>
      </div>

      {groups.length > 1 ? (
        <div className="mb-6">
          <DepartmentPills
            groups={groups.map((g) => ({ department: g.department, count: g.positions.length }))}
            selected={selected}
            total={roles.length}
          />
        </div>
      ) : null}

      {roles.length === 0 ? (
        <Card className="text-muted-foreground p-10 text-center text-sm">
          Nothing open right now. Check back soon.
        </Card>
      ) : (
        <div className="space-y-10">
          {visible.map((group) => (
            <section key={group.department} aria-labelledby={`dept-${group.department}`}>
              <h2
                id={`dept-${group.department}`}
                className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase"
              >
                {group.department}
              </h2>
              <div className="space-y-4">
                {group.positions.map((r) => (
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
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm">
                      {openingsLine(r.openings, r.applicationDeadline)}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

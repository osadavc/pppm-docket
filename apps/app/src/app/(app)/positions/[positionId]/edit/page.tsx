import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PositionForm } from "@/components/positions/position-form";
import { requirePermission } from "@/lib/auth/guards";
import { toDateInputValue } from "@/lib/format";
import { getPosition } from "@/lib/queries/positions";
import { listHiringManagers } from "@/lib/queries/users";
import type { PositionDraftInput } from "@/lib/validation/position";

export const metadata: Metadata = { title: "Edit position · Docket" };

export default async function EditPositionPage({
  params,
}: PageProps<"/positions/[positionId]/edit">) {
  const { positionId } = await params;
  if (!z.uuid().safeParse(positionId).success) notFound();

  await requirePermission("position:manage");

  const position = await getPosition(positionId);
  if (!position) notFound();

  const managers = await listHiringManagers();

  const defaultValues: PositionDraftInput = {
    title: position.title,
    department: position.department,
    location: position.location ?? "",
    employmentType: position.employmentType,
    description: position.description ?? "",
    requirements: position.requirements ?? "",
    openings: position.openings,
    applicationDeadline: toDateInputValue(position.applicationDeadline),
    salaryMin: position.salaryMin?.toString() ?? "",
    salaryMax: position.salaryMax?.toString() ?? "",
    requireFeedbackToAdvance: position.requireFeedbackToAdvance,
    hiringManagerId: position.hiringManagerId ?? "",
  };

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit {position.status === "draft" ? "draft" : "position"}
        </h1>
        <p className="text-muted-foreground text-sm">{position.title}</p>
      </div>

      <div className="max-w-3xl">
        <PositionForm
          positionId={position.id}
          defaultValues={defaultValues}
          managers={managers}
        />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { PositionForm } from "@/components/positions/position-form";
import { requirePermission } from "@/lib/auth/guards";
import { listHiringManagers } from "@/lib/queries/users";
import { EMPTY_POSITION_DRAFT } from "@/lib/validation/position";

export const metadata: Metadata = { title: "New position · Docket" };

export default async function NewPositionPage() {
  await requirePermission("position:manage");
  const managers = await listHiringManagers();

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New position</h1>
        <p className="text-muted-foreground text-sm">
          Saved as a draft. It stays off the careers board until you publish it,
          and a default interview pipeline is created with it.
        </p>
      </div>

      <div className="max-w-3xl">
        <PositionForm defaultValues={EMPTY_POSITION_DRAFT} managers={managers} />
      </div>
    </>
  );
}

import { PillNav } from "@/components/ui/pill-nav";

export function DepartmentPills({
  groups,
  selected,
  total,
}: {
  groups: Array<{ department: string; count: number }>;
  selected: string;
  total: number;
}) {
  return (
    <PillNav
      label="Filter by department"
      pills={[
        { key: "all", label: `All (${total})`, href: "/careers", active: selected === "" },
        ...groups.map((group) => ({
          key: group.department,
          label: `${group.department} (${group.count})`,
          href: `/careers?department=${encodeURIComponent(group.department)}`,
          active: selected === group.department,
        })),
      ]}
    />
  );
}

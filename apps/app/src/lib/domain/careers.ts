import { formatDate } from "@/lib/format";

/** "3 openings · apply by 30 Sep 2026" or "1 opening · open until filled". */
export function openingsLine(openings: number, deadline: Date | null) {
  const count = `${openings} opening${openings === 1 ? "" : "s"}`;
  return deadline
    ? `${count} · apply by ${formatDate(deadline)}`
    : `${count} · open until filled`;
}

export type DepartmentGroup<T extends { department: string }> = {
  department: string;
  positions: T[];
};

/** Board rows bucketed by department, keeping the rows' existing order. */
export function groupByDepartment<T extends { department: string }>(
  rows: T[],
): DepartmentGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.department) ?? [];
    list.push(row);
    groups.set(row.department, list);
  }
  return [...groups.entries()].map(([department, positions]) => ({
    department,
    positions,
  }));
}

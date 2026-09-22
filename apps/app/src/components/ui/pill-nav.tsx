import Link from "next/link";
import { cn } from "@/lib/utils";

export type Pill = { key: string; label: string; href: string; active: boolean };

/**
 * A row of link pills. Links rather than buttons so the selection is the URL:
 * it survives refresh, back, and being pasted to a colleague.
 */
export function PillNav({ pills, label }: { pills: Pill[]; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {pills.map((pill) => (
        <Link
          key={pill.key}
          href={pill.href}
          aria-current={pill.active ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            pill.active
              ? "bg-primary text-primary-foreground border-primary"
              : "hover:bg-accent text-muted-foreground",
          )}
        >
          {pill.label}
        </Link>
      ))}
    </nav>
  );
}

import Link from "next/link";
import { cn } from "@/lib/utils";

export const APPLICATION_TABS = ["feed", "feedback", "emails", "details"] as const;
export type ApplicationTab = (typeof APPLICATION_TABS)[number];

export function parseTab(value: string | string[] | undefined, fallback: ApplicationTab, allowed: readonly ApplicationTab[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  return allowed.includes(raw as ApplicationTab) ? (raw as ApplicationTab) : fallback;
}

/** Links, so the open tab is in the URL and survives refresh and back. */
export function ApplicationTabs({
  applicationId,
  tabs,
  current,
}: {
  applicationId: string;
  tabs: Array<{ id: ApplicationTab; label: string }>;
  current: ApplicationTab;
}) {
  return (
    <nav aria-label="Application sections" className="border-b">
      <ul className="-mb-px flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <Link
              href={`/applications/${applicationId}?tab=${tab.id}`}
              aria-current={tab.id === current ? "page" : undefined}
              className={cn(
                "inline-block border-b-2 px-3 py-2 text-sm transition-colors",
                tab.id === current
                  ? "border-primary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

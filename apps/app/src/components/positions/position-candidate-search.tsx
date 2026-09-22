"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";

/** Name/email search that keeps the current pill and resets the page. */
export function PositionCandidateSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const term = params.get("q") ?? "";

  function apply(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("q", value);
    else next.delete("q");
    next.delete("page");
    startTransition(() => {
      router.push(`${pathname}${next.toString() ? `?${next}` : ""}`);
    });
  }

  return (
    <form
      className="relative min-w-56 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        const value = new FormData(e.currentTarget).get("q");
        apply(typeof value === "string" ? value.trim() : "");
      }}
    >
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        key={term}
        name="q"
        defaultValue={term}
        onBlur={(e) => apply(e.target.value.trim())}
        placeholder="Search name or email"
        aria-label="Search candidates by name or email"
        className="pl-9"
      />
    </form>
  );
}

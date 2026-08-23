"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APPLICATION_STATUS_LABELS } from "@/lib/validation/candidate-search";

type Option = { id: string; title?: string; name?: string };

const ANY = "__any";

/**
 * Filters are written to the URL rather than held in component state. That is
 * what makes them survive navigation: opening a candidate and pressing back,
 * refreshing, or sharing the link all restore the same view.
 */
export function CandidateFilters({
  positions,
  stages,
}: {
  positions: Option[];
  stages: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const term = params.get("q") ?? "";

  function apply(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    // Any filter change invalidates the current page number.
    if (!("page" in changes)) next.delete("page");
    startTransition(() => {
      router.push(`${pathname}${next.toString() ? `?${next}` : ""}`);
    });
  }

  const positionId = params.get("positionId") ?? "";
  const stageId = params.get("stageId") ?? "";
  const status = params.get("status") ?? "";
  const hasFilters = Boolean(term || positionId || stageId || status);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative min-w-56 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get("q");
          apply({ q: (typeof value === "string" && value.trim()) || undefined });
        }}
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        {/*
          Uncontrolled and keyed by the URL value: the field resets itself when
          the query string changes (back button, Clear) without an effect
          mirroring URL state into component state.
        */}
        <Input
          key={term}
          name="q"
          defaultValue={term}
          onBlur={(e) => apply({ q: e.target.value.trim() || undefined })}
          placeholder="Search name or email"
          aria-label="Search candidates by name or email"
          className="pl-9"
        />
      </form>

      <Select
        value={positionId || ANY}
        onValueChange={(v) =>
          // Changing position invalidates the chosen stage: stages belong to a
          // position, so keeping it would filter by a stage that is not there.
          apply({ positionId: v === ANY ? undefined : v, stageId: undefined })
        }
      >
        <SelectTrigger className="w-52" aria-label="Filter by position">
          <SelectValue placeholder="All positions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All positions</SelectItem>
          {positions.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={stageId || ANY}
        disabled={!positionId}
        onValueChange={(v) => apply({ stageId: v === ANY ? undefined : v })}
      >
        <SelectTrigger className="w-48" aria-label="Filter by stage">
          <SelectValue placeholder={positionId ? "All stages" : "Pick a position"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All stages</SelectItem>
          {stages.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status || ANY}
        onValueChange={(v) => apply({ status: v === ANY ? undefined : v })}
      >
        <SelectTrigger className="w-40" aria-label="Filter by status">
          <SelectValue placeholder="Any status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any status</SelectItem>
          {Object.entries(APPLICATION_STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => router.push(pathname)}
        >
          <X /> Clear
        </Button>
      ) : null}
    </div>
  );
}

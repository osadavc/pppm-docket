import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildCandidateQuery,
  type CandidateSearch,
} from "@/lib/validation/candidate-search";

export function CandidatePagination({
  search,
  page,
  pageCount,
  total,
  pageSize,
}: {
  search: CandidateSearch;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm tabular-nums">
        {total === 0 ? "No results" : `${from}–${to} of ${total}`}
      </p>

      <div className="flex items-center gap-2">
        <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1}>
          {page > 1 ? (
            // Links, not buttons: paging keeps every other filter in the URL.
            <Link href={buildCandidateQuery({ ...search, page: page - 1 })}>
              <ChevronLeft /> Previous
            </Link>
          ) : (
            <span>
              <ChevronLeft /> Previous
            </span>
          )}
        </Button>

        <span className="text-muted-foreground text-sm tabular-nums">
          Page {page} of {pageCount}
        </span>

        <Button
          asChild={page < pageCount}
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
        >
          {page < pageCount ? (
            <Link href={buildCandidateQuery({ ...search, page: page + 1 })}>
              Next <ChevronRight />
            </Link>
          ) : (
            <span>
              Next <ChevronRight />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

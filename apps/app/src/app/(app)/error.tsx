"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Generic on purpose: `error.message` can carry a database error or a stack
 * fragment, and none of that belongs on screen. The digest is what support
 * needs to find the server-side log line.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <TriangleAlert className="text-destructive size-10" />
      <div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          The page could not be loaded. Try again, and if it keeps happening
          tell your administrator.
          {error.digest ? (
            <>
              {" "}
              <span className="font-mono">Reference: {error.digest}</span>
            </>
          ) : null}
        </p>
      </div>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

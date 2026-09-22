import { cn } from "@/lib/utils";

/**
 * Horizontal scroll container for wide tables with a visible affordance:
 * a fade on the right edge and an always-visible scrollbar, so on a phone
 * the columns that are cut off look cut off rather than absent.
 */
export function ScrollX({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative", className)}>
      <div
        data-slot="scroll-x"
        className="scroll-x overflow-x-auto"
        // Focusable so keyboard users can scroll the table sideways.
        tabIndex={0}
      >
        {children}
      </div>
      <div
        aria-hidden
        className="from-card pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l to-transparent md:hidden"
      />
    </div>
  );
}

"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Inline text that copies itself; falls back to plain text without a clipboard. */
export function ClickToCopy({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied.`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(`Could not copy the ${label.toLowerCase()}.`);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${label.toLowerCase()}`}
      className={cn(
        "hover:text-foreground inline-flex items-center gap-1 rounded text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <span className="break-all">{value}</span>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <Copy className="size-3.5 shrink-0 opacity-60" aria-hidden />
      )}
      <span className="sr-only">Copy {label.toLowerCase()}</span>
    </button>
  );
}

"use client";

import { format, parse, startOfToday } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const toDate = (value: string | null | undefined) =>
  value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;

export const DatePicker = ({
  id,
  value,
  onChange,
  onBlur,
  placeholder = "Pick a date",
  disablePast,
  invalid,
  className,
}: {
  id?: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disablePast?: boolean;
  invalid?: boolean;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onBlur?.();
      }}
    >
      <div className={cn("relative", className)}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid || undefined}
            className={cn(
              "w-full justify-start pr-9 font-normal",
              !selected && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="text-muted-foreground" />
            {selected ? format(selected, "EEE, d MMM yyyy") : placeholder}
          </Button>
        </PopoverTrigger>
        {selected ? (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => onChange("")}
            className="text-muted-foreground hover:text-foreground hover:bg-accent absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={disablePast ? startOfToday() : undefined}
          disabled={disablePast ? { before: startOfToday() } : undefined}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};

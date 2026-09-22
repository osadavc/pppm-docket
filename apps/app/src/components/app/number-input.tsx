"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const NumberInput = ({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string | null | undefined;
  onChange: (digits: string) => void;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);
  const display = group(value ?? "");

  useLayoutEffect(() => {
    const input = ref.current;
    if (!input || caretDigits.current === null || document.activeElement !== input) return;
    let seen = 0;
    let position = 0;
    while (position < display.length && seen < caretDigits.current) {
      if (/\d/.test(display[position]!)) seen++;
      position++;
    }
    input.setSelectionRange(position, position);
    caretDigits.current = null;
  }, [display]);

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={["tabular-nums", props.className].filter(Boolean).join(" ")}
      value={display}
      onChange={(event) => {
        const { value: raw, selectionStart } = event.target;
        caretDigits.current = raw.slice(0, selectionStart ?? raw.length).replace(/\D/g, "").length;
        onChange(raw.replace(/\D/g, "").replace(/^0+(?=\d)/, ""));
      }}
    />
  );
};

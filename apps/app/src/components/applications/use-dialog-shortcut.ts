"use client";

import { useEffect } from "react";

/**
 * Open a dialog from a single keypress. Ignored while typing in a field,
 * while any dialog is already open, and when a modifier is held, so "a" in
 * a note never fires an advance.
 */
export function useDialogShortcut(
  key: string | undefined,
  open: boolean,
  onTrigger: () => void,
) {
  useEffect(() => {
    if (!key || open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== key!.toLowerCase()) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.closest("[role=dialog]"))
      ) {
        return;
      }
      event.preventDefault();
      onTrigger();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, open, onTrigger]);
}

"use client";

import { CircleCheck, X } from "lucide-react";
import { useEffect, useState } from "react";

const SHOW_FOR_MS = 6000;

// A confirmation that floats above the page and fades on its own.  The
// query parameter that asked for it is dropped from the address, so
// reloading or sharing the page doesn't show it again.
export function ToastMessage({
  message,
  param,
}: {
  message: string;
  param: string;
}) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete(param);
    window.history.replaceState(window.history.state, "", url);
    const timer = setTimeout(() => setOpen(false), SHOW_FOR_MS);
    return () => clearTimeout(timer);
  }, [param]);
  if (!open) return null;
  return (
    // Above the tab bar on phones, bottom right on wider screens.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-50 flex justify-center px-4 md:inset-x-auto md:right-6 md:bottom-6">
      <div
        role="status"
        className="pointer-events-auto flex animate-in items-center gap-3 rounded-xl border bg-popover py-3 pr-2 pl-4 text-popover-foreground shadow-lg fade-in-0 slide-in-from-bottom-4"
      >
        <CircleCheck
          aria-hidden
          className="size-5 shrink-0 text-green-600 dark:text-green-400"
        />
        <p className="font-medium">{message}</p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setOpen(false)}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}

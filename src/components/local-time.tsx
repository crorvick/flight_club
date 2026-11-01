"use client";

import { useSyncExternalStore } from "react";

import { formatInstant, type InstantFormat } from "@/lib/dates";

const subscribe = () => () => {};

// An instant in the viewer's own time zone.  The server doesn't know it,
// so the server's HTML (and the first render in the browser, which must
// match it) shows UTC; the browser re-renders it locally straight after.
export function LocalTime({
  at,
  format = "datetime",
}: {
  at: Date;
  format?: InstantFormat;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <time dateTime={at.toISOString()}>
      {formatInstant(at, format, hydrated ? undefined : "UTC")}
    </time>
  );
}

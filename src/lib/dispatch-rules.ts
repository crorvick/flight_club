// Checking an aircraft out: confirming its meters read what the app
// expects (docs/spec.md, section 6, and the dispatch flow built on it).

import { formatHours } from "./hours";

export type OutCheck =
  | { status: "invalid"; message: string }
  // `gap` is how far past the expected reading the meter is, in
  // hundredths: time flown without being logged.  Zero when it matches.
  | { status: "ok"; gap: number };

// `expected` is the meter's current reading in the app; `typed` what the
// pilot reads off the panel, parsed (null if it couldn't be).
export function checkOutReading(
  expected: number,
  typed: number | null,
): OutCheck {
  if (typed === null) {
    return { status: "invalid", message: "Enter the reading like 1234.5." };
  }
  // Meters only go forward; lower means a misread, not unlogged time.
  if (typed < expected) {
    return {
      status: "invalid",
      message: `Can't be less than the last logged reading, ${formatHours(expected)}.`,
    };
  }
  return { status: "ok", gap: typed - expected };
}

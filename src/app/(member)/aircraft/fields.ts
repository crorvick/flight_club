import type { MeterKind } from "@/lib/meters";

// Form field name for a new aircraft's starting reading on one meter.
export const readingField = (kind: MeterKind) => `reading:${kind}`;

// The meters an aircraft can have (docs/spec.md, section 5).  This order
// is the database enum's; changing it means a migration.
export const METER_KINDS = ["tach", "hobbs", "air_time"] as const;

export type MeterKind = (typeof METER_KINDS)[number];

export const METER_LABELS: Record<MeterKind, string> = {
  hobbs: "Hobbs",
  tach: "Tach",
  air_time: "Air time",
};

// Display order: the order pilots read them off the panel.
export const METER_DISPLAY_ORDER: readonly MeterKind[] = [
  "hobbs",
  "tach",
  "air_time",
];

export function byMeterOrder<T extends { kind: MeterKind }>(a: T, b: T) {
  return (
    METER_DISPLAY_ORDER.indexOf(a.kind) - METER_DISPLAY_ORDER.indexOf(b.kind)
  );
}

// How much of an aircraft's flying a squawk or overdue maintenance item
// rules out: nothing, IFR (it can still fly VFR), or everything.

export const GROUNDING_LEVELS = ["none", "ifr", "all"] as const;
export type Grounding = (typeof GROUNDING_LEVELS)[number];

export type AircraftStatus = "airworthy" | "vfr-only" | "grounded";

export function worstGrounding(levels: Iterable<Grounding>): Grounding {
  let worst: Grounding = "none";
  for (const level of levels) {
    if (GROUNDING_LEVELS.indexOf(level) > GROUNDING_LEVELS.indexOf(worst)) {
      worst = level;
    }
  }
  return worst;
}

export function statusFor(level: Grounding): AircraftStatus {
  return level === "all"
    ? "grounded"
    : level === "ifr"
      ? "vfr-only"
      : "airworthy";
}

export const STATUS_LABELS: Record<AircraftStatus, string> = {
  airworthy: "Airworthy",
  "vfr-only": "VFR only",
  grounded: "Grounded",
};

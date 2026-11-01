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

// Squawks and maintenance items used to say only whether they grounded
// the aircraft, as a boolean that's still written alongside the level so
// the previous release reads them correctly during a deploy.  A row that
// release created has the level's default, "none", with the boolean set:
// count that as grounding everything.  Goes once the booleans are dropped.
export function effectiveGrounding(level: Grounding, legacyGrounds: boolean) {
  return level === "none" && legacyGrounds ? "all" : level;
}

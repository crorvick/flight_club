// Rules for logging and editing flights (docs/spec.md, section 6).  Kept
// free of the database and React so they can be unit tested and shared by
// the form's live feedback and the server action that enforces them.

// Above this a reading gets a "did you mean…?" warning, but isn't
// rejected: a long cross-country is rare, not impossible.
export const LONG_FLIGHT_HUNDREDTHS = 10 * 100;

export type ReadingCheck =
  | { status: "empty" }
  | { status: "invalid"; message: string }
  | { status: "ok"; duration: number; warning?: string };

// Check one meter's `in` reading against its `out`, both in hundredths
// (`in` null when it couldn't be parsed).
export function checkReading(
  out: number,
  typed: string,
  inHundredths: number | null,
): ReadingCheck {
  if (typed.trim() === "") return { status: "empty" };
  if (inHundredths === null) {
    return { status: "invalid", message: "Enter a reading like 1234.5." };
  }
  if (inHundredths <= out) {
    return {
      status: "invalid",
      message: "Must be more than the out reading.",
    };
  }
  const duration = inHundredths - out;
  if (duration > LONG_FLIGHT_HUNDREDTHS) {
    return {
      status: "ok",
      duration,
      warning: `That's ${(duration / 100).toFixed(1)} hours. Did you mean to log that much?`,
    };
  }
  return { status: "ok", duration };
}

export type EditableFlight = {
  pilotId: string;
  lockedAt: Date | null;
};

// A pilot may edit their own flight until the next flight on that
// aircraft is logged, which locks it.  After that only an officer can
// change it, through an audited correction.
export function canEditFlight(flight: EditableFlight, memberId: string) {
  return flight.pilotId === memberId && flight.lockedAt === null;
}

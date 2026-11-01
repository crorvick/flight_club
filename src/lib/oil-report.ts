// Oil between changes, for the oil report: what the engine ran, how long,
// and how much was added along the way.  Pure, so it can be tested; the
// page supplies the oil changes and flights.

import type { OilChangeDetails } from "./maintenance-kinds";

export type OilChange = {
  completedOn: string;
  // On the logbook meter, in hundredths, when the item counts hours.
  reading: number | null;
  details: OilChangeDetails;
};

export type OilFlight = {
  date: string;
  // The logbook meter's out reading and hours flown, in hundredths, if
  // the flight recorded that meter.
  logbookOut: number | null;
  logbookHours: number | null;
  // Quarts added per engine, as stored; null where not recorded.
  oilAdded: (string | null)[];
};

export type OilPeriod = {
  change: OilChange;
  // The change that ended it, or null for the oil in it now.
  next: OilChange | null;
  flights: number;
  // Hundredths of an hour on the logbook meter.
  hours: number;
  // Tenths of a quart added, per engine.
  added: number[];
  // Flights from before fuel and oil were recorded, which can't count.
  unrecorded: number;
};

// A flight belongs to the oil from a change if it started at or after the
// change and before the next one.  Readings place it exactly when both
// have them; otherwise dates do, and a flight on the day of a change
// counts as after it.
function within(flight: OilFlight, from: OilChange, to: OilChange | null) {
  const after =
    from.reading !== null && flight.logbookOut !== null
      ? flight.logbookOut >= from.reading
      : flight.date >= from.completedOn;
  if (!after) return false;
  if (to === null) return true;
  return to.reading !== null && flight.logbookOut !== null
    ? flight.logbookOut < to.reading
    : flight.date < to.completedOn;
}

const tenths = (quarts: string) => Math.round(Number(quarts) * 10);

// One period per change, oldest first, the last running to now.
export function oilPeriods(
  changes: OilChange[],
  flights: OilFlight[],
  engines: number,
): OilPeriod[] {
  return changes.map((change, i) => {
    const next = changes[i + 1] ?? null;
    const period: OilPeriod = {
      change,
      next,
      flights: 0,
      hours: 0,
      added: Array.from({ length: engines }, () => 0),
      unrecorded: 0,
    };
    for (const flight of flights) {
      if (!within(flight, change, next)) continue;
      period.flights += 1;
      period.hours += flight.logbookHours ?? 0;
      if (flight.oilAdded.slice(0, engines).some((q) => q === null)) {
        period.unrecorded += 1;
      }
      flight.oilAdded.slice(0, engines).forEach((q, engine) => {
        if (q !== null) period.added[engine] += tenths(q);
      });
    }
    return period;
  });
}

// Hours flown per quart added, to a tenth; null when none was added.
export function hoursPerQuart(hours: number, addedTenths: number) {
  if (addedTenths === 0) return null;
  return Math.round((hours / 100 / (addedTenths / 10)) * 10) / 10;
}

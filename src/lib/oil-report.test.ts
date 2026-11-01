import { describe, expect, it } from "vitest";

import type { OilChangeDetails } from "./maintenance-kinds";
import { hoursPerQuart, type OilFlight, oilPeriods } from "./oil-report";

const details = (oilType: string, quarts = ["6.0"]): OilChangeDetails => ({
  kind: "oil_change",
  quarts,
  oilType,
  filterReplaced: true,
  sampleSent: false,
});

const flight = (
  date: string,
  out: number,
  hours: number,
  oil: (string | null)[],
): OilFlight => ({
  date,
  logbookOut: out,
  logbookHours: hours,
  oilAdded: oil,
});

describe("oilPeriods", () => {
  it("splits flights between changes by logbook reading", () => {
    const changes = [
      { completedOn: "2026-06-01", reading: 100000, details: details("W100") },
      { completedOn: "2026-09-01", reading: 105000, details: details("X/C") },
    ];
    const flights = [
      flight("2026-06-01", 100000, 150, ["1.0"]),
      flight("2026-07-01", 103000, 200, ["0.5"]),
      // Flown on the day of the second change, but before it.
      flight("2026-09-01", 104800, 150, ["0"]),
      flight("2026-09-02", 105000, 120, ["1.0"]),
    ];
    const [first, current] = oilPeriods(changes, flights, 1);
    expect(first).toMatchObject({ flights: 3, hours: 500, added: [15] });
    expect(first.next?.details.oilType).toBe("X/C");
    expect(current).toMatchObject({
      flights: 1,
      hours: 120,
      added: [10],
      next: null,
    });
  });

  it("falls back to dates when a change has no reading", () => {
    const changes = [
      { completedOn: "2026-06-01", reading: null, details: details("W100") },
    ];
    const flights = [
      flight("2026-05-31", 99000, 100, ["1.0"]),
      flight("2026-06-01", 99100, 100, ["1.0"]),
    ];
    expect(oilPeriods(changes, flights, 1)[0]).toMatchObject({
      flights: 1,
      added: [10],
    });
  });

  it("counts each engine of a twin, and flights that didn't record oil", () => {
    const changes = [
      {
        completedOn: "2026-06-01",
        reading: 0,
        details: details("W100", ["8.0", "8.0"]),
      },
    ];
    const flights = [
      flight("2026-06-02", 10, 100, ["1.0", "0.5"]),
      flight("2026-06-03", 110, 100, [null, null]),
    ];
    expect(oilPeriods(changes, flights, 2)[0]).toMatchObject({
      flights: 2,
      hours: 200,
      added: [10, 5],
      unrecorded: 1,
    });
  });
});

describe("hoursPerQuart", () => {
  it("is hours per quart to a tenth, or nothing when none was added", () => {
    expect(hoursPerQuart(1500, 15)).toBe(10);
    expect(hoursPerQuart(1000, 30)).toBe(3.3);
    expect(hoursPerQuart(1000, 0)).toBeNull();
  });
});

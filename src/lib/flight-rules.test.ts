import { describe, expect, it } from "vitest";

import { canEditFlight, checkReading } from "./flight-rules";
import { parseHours } from "./hours";

const check = (out: string, typed: string) =>
  checkReading(parseHours(out)!, typed, parseHours(typed));

describe("checkReading", () => {
  it("waits for a reading", () => {
    expect(check("100.0", "")).toEqual({ status: "empty" });
    expect(check("100.0", "  ")).toEqual({ status: "empty" });
  });

  it("returns the duration in hundredths", () => {
    expect(check("100.0", "101.3")).toEqual({ status: "ok", duration: 130 });
  });

  it("rejects a reading that isn't a number", () => {
    expect(check("100.0", "1o1.3")).toMatchObject({ status: "invalid" });
  });

  it("rejects an in reading at or below out", () => {
    expect(check("100.0", "100.0")).toMatchObject({
      status: "invalid",
      message: "Must be more than the out reading.",
    });
    expect(check("100.0", "99.9")).toMatchObject({ status: "invalid" });
  });

  it("warns about, but accepts, more than ten hours", () => {
    expect(check("100.0", "110.0")).toEqual({ status: "ok", duration: 1000 });
    expect(check("100.0", "110.1")).toMatchObject({
      status: "ok",
      duration: 1010,
      warning: expect.stringContaining("10.1 hours"),
    });
  });

  it("catches a dropped decimal point", () => {
    expect(check("1234.5", "12359")).toMatchObject({
      status: "ok",
      warning: expect.stringContaining("Did you mean"),
    });
  });
});

describe("canEditFlight", () => {
  const pilotId = "pilot";

  it("lets the pilot edit their unlocked flight", () => {
    expect(canEditFlight({ pilotId, lockedAt: null }, pilotId)).toBe(true);
  });

  it("locks the flight once the next one is logged", () => {
    expect(canEditFlight({ pilotId, lockedAt: new Date() }, pilotId)).toBe(
      false,
    );
  });

  it("doesn't let other members edit it", () => {
    expect(canEditFlight({ pilotId, lockedAt: null }, "someone-else")).toBe(
      false,
    );
  });
});

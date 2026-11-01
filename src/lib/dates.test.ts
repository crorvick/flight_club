import { describe, expect, it } from "vitest";

import { formatDate, formatInstant } from "./dates";

describe("formatDate", () => {
  it("keeps the calendar day, whatever the time zone", () => {
    expect(formatDate("2026-10-25")).toBe("Oct 25, 2026");
    expect(formatDate("2026-10-25", { weekday: true })).toBe(
      "Sun, Oct 25, 2026",
    );
  });
});

describe("formatInstant", () => {
  const at = new Date("2026-11-01T14:38:00Z");

  it("shows the time in the given zone", () => {
    expect(formatInstant(at, "time", "America/Chicago")).toBe("8:38 AM");
    expect(formatInstant(at, "datetime", "UTC")).toBe("Sun, Nov 1, 2:38 PM");
    expect(formatInstant(at, "date", "UTC")).toBe("Nov 1, 2026");
  });
});

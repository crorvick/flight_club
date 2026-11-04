import { describe, expect, it } from "vitest";

import { cycleOn, cyclesToInstall, parseCycle } from "./airac";

describe("cycleOn", () => {
  it("names cycles by year and their place in it", () => {
    expect(cycleOn("2020-01-02")).toEqual({
      id: "2001",
      effective: "2020-01-02",
      ends: "2020-01-29",
    });
    // 2020 had 14.
    expect(cycleOn("2020-12-31").id).toBe("2014");
    expect(cycleOn("2021-01-28").id).toBe("2101");
    expect(cycleOn("2024-01-25").id).toBe("2401");
  });

  it("is current through the day before the next", () => {
    expect(cycleOn("2026-01-21").id).toBe("2513");
    expect(cycleOn("2026-01-22")).toEqual({
      id: "2601",
      effective: "2026-01-22",
      ends: "2026-02-18",
    });
  });

  it("counts cycles before and after", () => {
    expect(cycleOn("2026-01-22", -1).id).toBe("2513");
    expect(cycleOn("2026-01-22", 1).id).toBe("2602");
  });
});

describe("parseCycle", () => {
  it("finds the cycle", () => {
    expect(parseCycle("2601")?.effective).toBe("2026-01-22");
    expect(parseCycle("2014")?.effective).toBe("2020-12-31");
  });

  it("refuses cycles that don't exist", () => {
    expect(parseCycle("2614")).toBeNull();
    expect(parseCycle("2600")).toBeNull();
    expect(parseCycle("26-1")).toBeNull();
  });
});

describe("cyclesToInstall", () => {
  it("suggests the current cycle until the next is a week off", () => {
    // 2602 takes effect on 19 February.
    expect(cyclesToInstall("2026-02-11").suggested.id).toBe("2601");
    expect(cyclesToInstall("2026-02-12").suggested.id).toBe("2602");
    expect(cyclesToInstall("2026-02-12").options.map((c) => c.id)).toEqual([
      "2601",
      "2602",
    ]);
  });
});

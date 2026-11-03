import { describe, expect, it } from "vitest";

import {
  checkTotalizer,
  formatAmount,
  fuelUsed,
  lastTotalizer,
  parseAmount,
} from "./fluids";

const fuel = { max: 200, unit: "gallons", missing: "Enter the fuel added." };

describe("parseAmount", () => {
  it("requires a value", () => {
    expect(parseAmount("", fuel)).toEqual({
      status: "invalid",
      message: "Enter the fuel added.",
    });
    expect(parseAmount("  ", fuel)).toMatchObject({ status: "invalid" });
  });

  it("reads zero, whole numbers and tenths", () => {
    expect(parseAmount("0", fuel)).toEqual({ status: "ok", value: "0.0" });
    expect(parseAmount("12", fuel)).toEqual({ status: "ok", value: "12.0" });
    expect(parseAmount(" 0.5 ", { ...fuel, max: 15 })).toEqual({
      status: "ok",
      value: "0.5",
    });
  });

  it("rejects anything else", () => {
    for (const typed of ["12.55", "-1", "abc", "1,5", "1234"]) {
      expect(parseAmount(typed, fuel)).toEqual({
        status: "invalid",
        message: "Enter gallons like 12.5.",
      });
    }
  });

  it("rejects more than the maximum", () => {
    expect(parseAmount("16", { max: 15, unit: "quarts", missing: "" })).toEqual(
      { status: "invalid", message: "That's more than 15 quarts." },
    );
  });
});

describe("formatAmount", () => {
  it("shows a tenth and the unit", () => {
    expect(formatAmount("12", "gal")).toBe("12.0 gal");
    expect(formatAmount("1.5", "qt")).toBe("1.5 qt");
  });
});

describe("totalizers", () => {
  // Out at 30.0 gal, fueled at 25.0 and reset to 50.0, then at 41.0 and
  // reset to 53.0.
  const log = {
    out: 300,
    resets: [
      { remaining: 250, reset: 500 },
      { remaining: 410, reset: 530 },
    ],
  };

  it("expects what it was last reset to", () => {
    expect(lastTotalizer(log)).toBe(530);
    expect(lastTotalizer({ out: 300, resets: [] })).toBe(300);
  });

  it("counts the drop between each reading and the reset before it", () => {
    expect(fuelUsed(log, 380)).toBe(50 + 90 + 150);
    expect(fuelUsed({ out: 300, resets: [] }, 120)).toBe(180);
    expect(fuelUsed({ out: 300, resets: [] }, 300)).toBe(0);
  });

  it("can't count a reading higher than the one before", () => {
    expect(fuelUsed(log, 540)).toBeNull();
    // As when the entry resetting to 50.0 is removed.
    expect(
      fuelUsed({ out: 300, resets: [{ remaining: 410, reset: 530 }] }, 380),
    ).toBeNull();
  });

  it("refuses a reading higher than it last showed", () => {
    expect(checkTotalizer(log, 530)).toEqual({ status: "ok" });
    expect(checkTotalizer(log, 531)).toEqual({
      status: "invalid",
      message:
        "It showed 53.0 gal after the last reset, so it can't show more now.",
    });
    expect(checkTotalizer({ out: 300, resets: [] }, 310)).toEqual({
      status: "invalid",
      message: "It showed 30.0 gal at check-out, so it can't show more now.",
    });
  });
});

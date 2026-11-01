import { describe, expect, it } from "vitest";

import { formatAmount, parseAmount } from "./fluids";

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

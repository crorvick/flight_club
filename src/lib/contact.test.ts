import { describe, expect, it } from "vitest";

import { parsePhone, telHref } from "./contact";

describe("parsePhone", () => {
  it("is optional", () => {
    expect(parsePhone("")).toEqual({ status: "ok", value: null });
    expect(parsePhone("   ")).toEqual({ status: "ok", value: null });
  });

  it("keeps a number as typed", () => {
    for (const typed of [
      "555-123-4567",
      "(555) 123-4567",
      "555.123.4567",
      "+1 555 123 4567",
      "123-4567",
    ]) {
      expect(parsePhone(typed)).toEqual({ status: "ok", value: typed });
    }
    expect(parsePhone("  555  123 4567 ")).toEqual({
      status: "ok",
      value: "555 123 4567",
    });
  });

  it("rejects anything else", () => {
    for (const typed of ["call me", "555-1234 x12", "12345", "1".repeat(16)]) {
      expect(parsePhone(typed)).toEqual({
        status: "invalid",
        message: "Enter a phone number like 555-123-4567.",
      });
    }
  });
});

describe("telHref", () => {
  it("keeps only the digits and a leading +", () => {
    expect(telHref("(555) 123-4567")).toBe("tel:5551234567");
    expect(telHref("+1 555 123 4567")).toBe("tel:+15551234567");
  });
});

import { describe, expect, it } from "vitest";

import { formatHours, parseHours, toHours } from "./hours";

describe("parseHours", () => {
  it.each([
    ["1234", 123400],
    ["1234.5", 123450],
    ["1234.56", 123456],
    ["0.1", 10],
    [" 12.3 ", 1230],
    ["1234.50", 123450],
  ])("parses %j", (input, expected) => {
    expect(parseHours(input)).toBe(expected);
  });

  it.each(["", "abc", "-1", "1.234", "1,234.5", ".5", "1.", "12345678", "1e3"])(
    "rejects %j",
    (input) => {
      expect(parseHours(input)).toBeNull();
    },
  );

  it("adds without float error", () => {
    expect(parseHours("0.1")! + parseHours("0.2")!).toBe(parseHours("0.3"));
  });
});

describe("toHours", () => {
  it("keeps two decimals for the database", () => {
    expect(toHours(123450)).toBe("1234.50");
    expect(toHours(5)).toBe("0.05");
  });
});

describe("formatHours", () => {
  it("drops a trailing zero", () => {
    expect(formatHours(123450)).toBe("1234.5");
    expect(formatHours(123400)).toBe("1234.0");
    expect(formatHours(123456)).toBe("1234.56");
  });
});

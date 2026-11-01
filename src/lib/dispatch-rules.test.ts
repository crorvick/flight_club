import { describe, expect, it } from "vitest";

import { checkOutReading } from "./dispatch-rules";

describe("checkOutReading", () => {
  it("accepts the expected reading with no gap", () => {
    expect(checkOutReading(123450, 123450)).toEqual({ status: "ok", gap: 0 });
  });

  it("reports unlogged time as a gap", () => {
    expect(checkOutReading(123450, 123570)).toEqual({ status: "ok", gap: 120 });
  });

  it("rejects a reading below the last logged one", () => {
    expect(checkOutReading(123450, 123400)).toEqual({
      status: "invalid",
      message: "Can't be less than the last logged reading, 1234.5.",
    });
  });

  it("rejects a reading it couldn't parse", () => {
    expect(checkOutReading(123450, null)).toMatchObject({ status: "invalid" });
  });
});

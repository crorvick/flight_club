import { describe, expect, it } from "vitest";

import { statusFor, worstGrounding } from "./grounding";

describe("worstGrounding", () => {
  it("is none with nothing to go on", () => {
    expect(worstGrounding([])).toBe("none");
  });

  it("takes the most restrictive level", () => {
    expect(worstGrounding(["none", "ifr"])).toBe("ifr");
    expect(worstGrounding(["ifr", "all", "none"])).toBe("all");
  });
});

describe("statusFor", () => {
  it("names the aircraft's status", () => {
    expect(statusFor("none")).toBe("airworthy");
    expect(statusFor("ifr")).toBe("vfr-only");
    expect(statusFor("all")).toBe("grounded");
  });
});

import { describe, expect, it } from "vitest";

import { effectiveGrounding, statusFor, worstGrounding } from "./grounding";

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

describe("effectiveGrounding", () => {
  it("uses the level when one is set", () => {
    expect(effectiveGrounding("ifr", true)).toBe("ifr");
    expect(effectiveGrounding("all", true)).toBe("all");
    expect(effectiveGrounding("none", false)).toBe("none");
  });

  it("treats a row from the previous release as grounding everything", () => {
    expect(effectiveGrounding("none", true)).toBe("all");
  });
});

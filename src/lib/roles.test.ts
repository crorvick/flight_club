import { describe, expect, it } from "vitest";

import { knownRoles } from "./roles";

describe("knownRoles", () => {
  it("lists roles in one order, whatever order they were stored in", () => {
    expect(knownRoles(["officer", "pilot"])).toEqual(["pilot", "officer"]);
    expect(knownRoles(["pilot", "officer"])).toEqual(["pilot", "officer"]);
  });

  it("drops tags it doesn't know", () => {
    expect(knownRoles(["mechanic", "officer"])).toEqual(["officer"]);
    expect(knownRoles([])).toEqual([]);
  });
});

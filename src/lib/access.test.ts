import { describe, expect, it } from "vitest";

import { decideAccess, hasRole, type MemberAccess } from "./access";

const officer: MemberAccess = { active: true, roles: ["pilot", "officer"] };
const pilot: MemberAccess = { active: true, roles: ["pilot"] };
const untagged: MemberAccess = { active: true, roles: [] };
const pending: MemberAccess = { active: false, roles: [] };
const deactivatedOfficer: MemberAccess = { active: false, roles: ["officer"] };

describe("decideAccess", () => {
  it("sends anonymous visitors to sign in", () => {
    expect(decideAccess(null, "active")).toBe("sign-in");
    expect(decideAccess(null, "officer")).toBe("sign-in");
  });

  it("holds inactive members at pending, whatever their tags", () => {
    expect(decideAccess(pending, "active")).toBe("pending");
    expect(decideAccess(deactivatedOfficer, "officer")).toBe("pending");
  });

  it("lets any active member through an active-only check", () => {
    expect(decideAccess(untagged, "active")).toBe("allow");
  });

  it("requires the tag for a role check", () => {
    expect(decideAccess(officer, "officer")).toBe("allow");
    expect(decideAccess(pilot, "officer")).toBe("forbidden");
    expect(decideAccess(untagged, "pilot")).toBe("forbidden");
  });
});

describe("hasRole", () => {
  it("is false for a deactivated member who still holds the tag", () => {
    expect(hasRole(deactivatedOfficer, "officer")).toBe(false);
    expect(hasRole(officer, "officer")).toBe(true);
  });
});

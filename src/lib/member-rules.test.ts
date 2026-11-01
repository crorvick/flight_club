import { describe, expect, it } from "vitest";

import { checkMemberChange, isPending } from "./member-rules";

describe("isPending", () => {
  it("is a new account: inactive with no roles", () => {
    expect(isPending({ active: false, roles: [] })).toBe(true);
  });

  it("isn't a deactivated member who kept their roles", () => {
    expect(isPending({ active: false, roles: ["pilot"] })).toBe(false);
  });

  it("isn't an active member", () => {
    expect(isPending({ active: true, roles: [] })).toBe(false);
  });
});

describe("checkMemberChange", () => {
  const officer = "officer-id";

  it("lets an officer change anyone else", () => {
    expect(
      checkMemberChange(officer, "other", { active: false, roles: [] }),
    ).toBeUndefined();
  });

  it("lets an officer change their own other roles", () => {
    expect(
      checkMemberChange(officer, officer, {
        active: true,
        roles: ["officer"],
      }),
    ).toBeUndefined();
  });

  it("stops an officer deactivating themselves", () => {
    expect(
      checkMemberChange(officer, officer, {
        active: false,
        roles: ["officer"],
      }),
    ).toMatch(/deactivate yourself/);
  });

  it("stops an officer dropping their own officer role", () => {
    expect(
      checkMemberChange(officer, officer, { active: true, roles: ["pilot"] }),
    ).toMatch(/own officer role/);
  });
});

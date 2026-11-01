import { describe, expect, it } from "vitest";

import { changedFields } from "./audit-diff";

describe("changedFields", () => {
  it("keeps only the fields that changed", () => {
    expect(
      changedFields(
        { name: "Dana", active: false, roles: "pilot" },
        { name: "Dana", active: true },
      ),
    ).toEqual({
      before: { active: false },
      after: { active: true },
      changed: true,
    });
  });

  it("compares dates by time", () => {
    const at = new Date("2026-11-01T12:00:00Z");
    expect(changedFields({ at }, { at: new Date(at.getTime()) }).changed).toBe(
      false,
    );
  });

  it("compares arrays by value", () => {
    expect(
      changedFields({ roles: ["pilot"] }, { roles: ["pilot"] }).changed,
    ).toBe(false);
    expect(
      changedFields({ roles: ["pilot"] }, { roles: ["officer", "pilot"] }),
    ).toMatchObject({ after: { roles: ["officer", "pilot"] } });
  });

  it("reports no change", () => {
    expect(changedFields({ a: 1 }, { a: 1 })).toEqual({
      before: {},
      after: {},
      changed: false,
    });
  });
});

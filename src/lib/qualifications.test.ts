import { describe, expect, it } from "vitest";

import {
  flightReviewExpires,
  type PilotStatus,
  pilotWarnings,
} from "./qualifications";

const today = "2026-11-01";
const current: PilotStatus = {
  medicalExpiresOn: "2027-06-30",
  flightReviewOn: "2026-02-10",
  checkedOut: true,
};

describe("flightReviewExpires", () => {
  it("runs to the end of the 24th calendar month", () => {
    expect(flightReviewExpires("2026-02-10")).toBe("2028-02-29");
    expect(flightReviewExpires("2024-11-30")).toBe("2026-11-30");
  });
});

describe("pilotWarnings", () => {
  it("has nothing to say about a current pilot", () => {
    expect(pilotWarnings(current, today)).toEqual([]);
  });

  it("notes a missing medical or flight review", () => {
    expect(
      pilotWarnings(
        { ...current, medicalExpiresOn: null, flightReviewOn: null },
        today,
      ).map((w) => w.message),
    ).toEqual(["No medical on file.", "No flight review on file."]);
  });

  it("flags an expired medical", () => {
    expect(
      pilotWarnings({ ...current, medicalExpiresOn: "2026-10-31" }, today),
    ).toEqual([
      { severity: "expired", message: "Your medical expired on 2026-10-31." },
    ]);
  });

  it("warns of a medical expiring within 30 days", () => {
    expect(
      pilotWarnings({ ...current, medicalExpiresOn: "2026-11-30" }, today),
    ).toEqual([
      {
        severity: "soon",
        message: "Your medical expires on 2026-11-30 (29 days).",
      },
    ]);
  });

  it("computes the flight review's expiry", () => {
    expect(
      pilotWarnings({ ...current, flightReviewOn: "2024-10-15" }, today),
    ).toEqual([
      {
        severity: "expired",
        message: "Your flight review expired on 2026-10-31.",
      },
    ]);
    expect(
      pilotWarnings({ ...current, flightReviewOn: "2024-11-15" }, today)[0]
        .severity,
    ).toBe("soon");
  });

  it("flags flying an aircraft without a checkout", () => {
    expect(pilotWarnings({ ...current, checkedOut: false }, today)).toEqual([
      {
        severity: "expired",
        message: "You're not checked out in this aircraft.",
      },
    ]);
  });
});

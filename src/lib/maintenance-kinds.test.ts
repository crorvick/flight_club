import { describe, expect, it } from "vitest";

import {
  describeDetails,
  FIELDS,
  parseCompletionDetails,
} from "./maintenance-kinds";

const form = (values: Record<string, string>) => (name: string) =>
  values[name] ?? "";

describe("VOR checks", () => {
  const parse = (values: Record<string, string>) =>
    parseCompletionDetails("vor_check", form(values), { engines: 1 });

  it("records each receiver's error", () => {
    expect(
      parse({
        [FIELDS.vorMethod]: "vot",
        [FIELDS.vorPlace]: "KMSP VOT",
        [FIELDS.vorNav1]: "+2",
        [FIELDS.vorNav2]: "−1.5",
      }),
    ).toEqual({
      details: {
        kind: "vor_check",
        method: "vot",
        place: "KMSP VOT",
        readings: [
          { receiver: "NAV 1", error: 2 },
          { receiver: "NAV 2", error: -1.5 },
        ],
      },
    });
  });

  it("allows a single receiver", () => {
    const result = parse({
      [FIELDS.vorMethod]: "ground",
      [FIELDS.vorPlace]: "FCM checkpoint",
      [FIELDS.vorNav1]: "3",
    });
    expect(result).toMatchObject({
      details: { readings: [{ receiver: "NAV 1", error: 3 }] },
    });
  });

  it("refuses an error outside the limit for the method", () => {
    const values = {
      [FIELDS.vorPlace]: "GEP",
      [FIELDS.vorNav1]: "5",
    };
    expect(parse({ ...values, [FIELDS.vorMethod]: "vot" })).toEqual({
      fieldErrors: {
        [FIELDS.vorNav1]: [
          "More than the ±4° allowed for this check. It doesn't count; have the receiver looked at.",
        ],
      },
    });
    // Airborne checks allow 6°.
    expect(parse({ ...values, [FIELDS.vorMethod]: "airborne" })).toHaveProperty(
      "details",
    );
  });

  it("compares the receivers on a dual check", () => {
    const result = parse({
      [FIELDS.vorMethod]: "dual",
      [FIELDS.vorPlace]: "Over GEP",
      [FIELDS.vorBetween]: "3",
    });
    expect(result).toHaveProperty("details");
    if ("details" in result) {
      expect(describeDetails(result.details!)).toBe(
        "Dual VOR, one against the other at Over GEP: 3° apart",
      );
    }
  });

  it("needs a method, a place and a reading", () => {
    expect(parse({})).toEqual({
      fieldErrors: { [FIELDS.vorMethod]: ["Choose how it was checked."] },
    });
    expect(parse({ [FIELDS.vorMethod]: "vot" })).toEqual({
      fieldErrors: {
        [FIELDS.vorPlace]: ["Enter where: the VOT, checkpoint or VOR."],
        [FIELDS.vorNav1]: ["Enter the bearing error in degrees."],
      },
    });
  });
});

describe("oil changes", () => {
  it("records the oil put in each engine", () => {
    const result = parseCompletionDetails(
      "oil_change",
      form({
        [FIELDS.oilQuarts(0)]: "6",
        [FIELDS.oilQuarts(1)]: "6.5",
        [FIELDS.oilType]: "AeroShell W100",
        [FIELDS.oilFilter]: "on",
      }),
      { engines: 2 },
    );
    expect(result).toEqual({
      details: {
        kind: "oil_change",
        quarts: ["6.0", "6.5"],
        oilType: "AeroShell W100",
        filterReplaced: true,
        sampleSent: false,
      },
    });
    if ("details" in result) {
      expect(describeDetails(result.details!)).toBe(
        "Left 6.0 qt, right 6.5 qt of AeroShell W100; filter replaced",
      );
    }
  });

  it("needs oil in every engine, and its type", () => {
    expect(
      parseCompletionDetails(
        "oil_change",
        form({ [FIELDS.oilQuarts(0)]: "0" }),
        { engines: 2 },
      ),
    ).toEqual({
      fieldErrors: {
        [FIELDS.oilQuarts(0)]: ["An oil change puts oil in; enter how much."],
        [FIELDS.oilQuarts(1)]: ["Enter the oil put in the right engine."],
        [FIELDS.oilType]: ["Enter the oil used, e.g. AeroShell W100."],
      },
    });
  });

  it("describes a single's without naming the engine", () => {
    expect(
      describeDetails({
        kind: "oil_change",
        quarts: ["7.0"],
        oilType: "Phillips X/C 20W-50",
        filterReplaced: false,
        sampleSent: true,
      }),
    ).toBe("7.0 qt of Phillips X/C 20W-50; oil sample sent");
  });
});

it("asks nothing more of a general item", () => {
  expect(parseCompletionDetails("general", form({}), { engines: 1 })).toEqual({
    details: null,
  });
});

import { describe, expect, it } from "vitest";

import {
  defaultName,
  describeDetails,
  FIELDS,
  itemTitle,
  parseCompletionDetails,
  scheduleFor,
} from "./maintenance-kinds";

const form = (values: Record<string, string>) => (name: string) =>
  values[name] ?? "";

describe("VOR checks", () => {
  const parse = (values: Record<string, string>) =>
    parseCompletionDetails("vor_check", form(values), {
      engines: 1,
      schedule: "recurring",
    });

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
      { engines: 2, schedule: "recurring" },
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
        { engines: 2, schedule: "recurring" },
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
  expect(
    parseCompletionDetails("general", form({}), {
      engines: 1,
      schedule: "recurring",
    }),
  ).toEqual({
    details: null,
  });
});

describe("ADs and SBs", () => {
  const parse = (
    values: Record<string, string>,
    schedule: "once" | "recurring" = "recurring",
  ) =>
    parseCompletionDetails("airworthiness_directive", form(values), {
      engines: 1,
      schedule,
    });

  it("record the method of compliance", () => {
    expect(
      parse({ [FIELDS.directiveMethod]: "Inspected per (g); no cracks" }),
    ).toEqual({
      details: {
        kind: "airworthiness_directive",
        method: "Inspected per (g); no cracks",
        terminating: false,
      },
    });
  });

  it("can end a recurring one with its terminating action", () => {
    const values = {
      [FIELDS.directiveMethod]: "Replaced the adapter",
      [FIELDS.directiveTerminating]: "on",
    };
    expect(parse(values)).toMatchObject({ details: { terminating: true } });
    // One done once has nothing more to end.
    expect(parse(values, "once")).toMatchObject({
      details: { terminating: false },
    });
    expect(
      describeDetails({
        kind: "airworthiness_directive",
        method: "Replaced the adapter",
        terminating: true,
      }),
    ).toBe("Replaced the adapter; terminating action");
  });

  it("need a method", () => {
    expect(parse({})).toEqual({
      fieldErrors: {
        [FIELDS.directiveMethod]: [
          "Enter how it was complied with, e.g. inspected per paragraph (g).",
        ],
      },
    });
  });

  it("are titled by number and subject", () => {
    expect(defaultName("airworthiness_directive", "2020-12-05")).toBe(
      "AD 2020-12-05",
    );
    expect(
      itemTitle({
        kind: "airworthiness_directive",
        name: "Oil filter adapter",
        reference: "2020-12-05",
      }),
    ).toBe("AD 2020-12-05: Oil filter adapter");
    expect(
      itemTitle({
        kind: "service_bulletin",
        name: "Lycoming SB 480F",
        reference: "Lycoming SB 480F",
      }),
    ).toBe("Lycoming SB 480F");
  });
});

describe("navigation databases", () => {
  it("record the cycle installed", () => {
    const parse = (cycle: string) =>
      parseCompletionDetails(
        "nav_database",
        form({ [FIELDS.navCycle]: cycle }),
        { engines: 1, schedule: "expires" },
      );
    expect(parse("2612")).toEqual({
      details: { kind: "nav_database", cycle: "2612" },
    });
    expect(parse("2699")).toEqual({
      fieldErrors: { [FIELDS.navCycle]: ["Choose the cycle installed."] },
    });
  });
});

describe("altimeter checks", () => {
  it("record the altitude tested to", () => {
    const parse = (feet: string) =>
      parseCompletionDetails(
        "altimeter_check",
        form({ [FIELDS.altimeterTestedTo]: feet }),
        { engines: 1, schedule: "recurring" },
      );
    const details = { kind: "altimeter_check", testedTo: 20000 } as const;
    expect(parse("20,000")).toEqual({ details });
    expect(describeDetails(details)).toBe("Altimeter tested to 20,000 ft");
    expect(parse("")).toEqual({
      fieldErrors: {
        [FIELDS.altimeterTestedTo]: [
          "Enter the altitude it was tested to, e.g. 20,000.",
        ],
      },
    });
    for (const typed of ["500", "70000", "20k"]) {
      expect(parse(typed)).toEqual({
        fieldErrors: {
          [FIELDS.altimeterTestedTo]: ["Enter feet between 1,000 and 60,000."],
        },
      });
    }
  });
});

describe("scheduleFor", () => {
  it("keeps a schedule the kind can have, else uses its default", () => {
    expect(scheduleFor("general", "expires")).toBe("expires");
    expect(scheduleFor("airworthiness_directive", "recurring")).toBe(
      "recurring",
    );
    expect(scheduleFor("airworthiness_directive", "expires")).toBe("once");
    expect(scheduleFor("nav_database", "recurring")).toBe("expires");
    expect(scheduleFor("elt_battery", "recurring")).toBe("expires");
  });
});

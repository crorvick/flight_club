// Kinds of maintenance item, for those whose completion has more to
// record than a date, reading and note.  The details are kept with each
// completion, tagged with their kind so they still read correctly if the
// item's kind changes later.  Kept free of the database and React, so the
// form and the server action share the rules.

import { parseCycle } from "./airac";
import { engineLabels } from "./engines";
import { MAX_OIL_QUARTS, parseAmount } from "./fluids";
import type { Grounding } from "./grounding";

// This order is the database enum's; new kinds go on the end.
export const MAINTENANCE_KINDS = [
  "general",
  "annual",
  "vor_check",
  "oil_change",
  "hundred_hour",
  "airworthiness_directive",
  "service_bulletin",
  "nav_database",
] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];

export const KIND_LABELS: Record<MaintenanceKind, string> = {
  general: "General",
  // Logged like a general item; the mechanic's report counts from it.
  annual: "Annual inspection",
  vor_check: "VOR check",
  oil_change: "Oil change",
  hundred_hour: "100-hour inspection",
  airworthiness_directive: "Airworthiness directive",
  service_bulletin: "Service bulletin",
  nav_database: "Navigation database",
};

// How an item comes due: again and again after each time it's done,
// once by a date or reading and then never again, or on an expiration
// date that each renewal replaces.
export const SCHEDULES = ["recurring", "once", "expires"] as const;
export type Schedule = (typeof SCHEDULES)[number];

// What each kind can be, its default first.  ADs and SBs are mostly
// done once; a recurring one ends with its terminating action.  A 100-
// hour inspection is always 100 hours, and a navigation database
// expires with its AIRAC cycle.
export const KIND_SCHEDULES: Record<MaintenanceKind, readonly Schedule[]> = {
  general: ["recurring", "once", "expires"],
  annual: ["recurring"],
  vor_check: ["recurring"],
  oil_change: ["recurring"],
  hundred_hour: ["recurring"],
  airworthiness_directive: ["once", "recurring"],
  service_bulletin: ["once", "recurring"],
  nav_database: ["expires"],
};

export function scheduleFor(kind: MaintenanceKind, asked: string) {
  const allowed = KIND_SCHEDULES[kind];
  return allowed.find((s) => s === asked) ?? allowed[0];
}

// What a new item of each kind does when overdue, until changed: ADs are
// mandatory and SBs advisory under Part 91, and an expired database only
// rules out IFR.
export const KIND_GROUNDING: Record<MaintenanceKind, Grounding> = {
  general: "all",
  annual: "all",
  vor_check: "ifr",
  oil_change: "none",
  hundred_hour: "all",
  airworthiness_directive: "all",
  service_bulletin: "none",
  nav_database: "ifr",
};

export const HUNDRED_HOURS = "100.00";

export const isDirective = (kind: MaintenanceKind) =>
  kind === "airworthiness_directive" || kind === "service_bulletin";

// What an AD or SB covers, as AD records are kept.
export const DIRECTIVE_SCOPES = [
  "airframe",
  "engine",
  "propeller",
  "appliance",
] as const;
export type DirectiveScope = (typeof DIRECTIVE_SCOPES)[number];

export const SCOPE_LABELS: Record<DirectiveScope, string> = {
  airframe: "Airframe",
  engine: "Engine",
  propeller: "Propeller",
  appliance: "Appliance",
};

// An item's name when it isn't given one: the kind's, or for an AD or SB
// its number.
export function defaultName(kind: MaintenanceKind, reference: string | null) {
  if (kind === "airworthiness_directive") return `AD ${reference}`;
  if (kind === "service_bulletin") return reference ?? KIND_LABELS[kind];
  return KIND_LABELS[kind];
}

// How an item is listed: an AD or SB by its number and subject, "AD
// 2020-12-05: Oil filter adapter", anything else by its name.
export function itemTitle(item: {
  kind: MaintenanceKind;
  name: string;
  reference: string | null;
}) {
  const fallback = defaultName(item.kind, item.reference);
  return isDirective(item.kind) && item.name !== fallback
    ? `${fallback}: ${item.name}`
    : item.name;
}

// 14 CFR 91.171: how the check was made sets the largest bearing error
// that passes.  A dual check compares the two receivers with each other.
export const VOR_METHODS = ["vot", "ground", "airborne", "dual"] as const;
export type VorMethod = (typeof VOR_METHODS)[number];

export const VOR_METHOD_LABELS: Record<VorMethod, string> = {
  vot: "VOT",
  ground: "VOR ground checkpoint",
  airborne: "Airborne checkpoint",
  dual: "Dual VOR, one against the other",
};

export const VOR_LIMITS: Record<VorMethod, number> = {
  vot: 4,
  ground: 4,
  airborne: 6,
  dual: 4,
};

export type VorCheckDetails = {
  kind: "vor_check";
  method: VorMethod;
  // The facility, checkpoint or VOT used.
  place: string;
  // Degrees: each receiver's error, or for a dual check the difference
  // between them.
  readings: { receiver: string; error: number }[];
};

export type OilChangeDetails = {
  kind: "oil_change";
  // Per engine, as stored decimals ("6.0"); one entry on a single.
  quarts: string[];
  oilType: string;
  filterReplaced: boolean;
  sampleSent: boolean;
};

export type DirectiveDetails = {
  kind: "airworthiness_directive" | "service_bulletin";
  // The method of compliance, as the AD record asks for.
  method: string;
  // For a recurring one: this ended it, and no more is due.
  terminating: boolean;
};

export type NavDatabaseDetails = {
  kind: "nav_database";
  // The AIRAC cycle installed, "2612".
  cycle: string;
};

export type CompletionDetails =
  VorCheckDetails | OilChangeDetails | DirectiveDetails | NavDatabaseDetails;

// Form field names.
export const FIELDS = {
  vorMethod: "vorMethod",
  vorPlace: "vorPlace",
  vorNav1: "vorNav1",
  vorNav2: "vorNav2",
  vorBetween: "vorBetween",
  oilQuarts: (engine: number) => `oilQuarts${engine}`,
  oilType: "oilType",
  oilFilter: "oilFilter",
  oilSample: "oilSample",
  directiveMethod: "directiveMethod",
  directiveTerminating: "directiveTerminating",
  navCycle: "navCycle",
} as const;

const DEGREES = /^[+\-]?\d{1,2}(?:\.\d)?$/;

function parseDegrees(typed: string): number | null {
  // A typographic minus counts as one.
  const trimmed = typed.trim().replace("\u2212", "-");
  return DEGREES.test(trimmed) ? Number(trimmed) : null;
}

type Get = (name: string) => string;
type Parsed =
  | { details: CompletionDetails | null }
  | { fieldErrors: Record<string, string[]> };

// What the completion form sends for an item of this kind, checked.
// General items and inspections have no details.
export function parseCompletionDetails(
  kind: MaintenanceKind,
  get: Get,
  { engines, schedule }: { engines: number; schedule: Schedule },
): Parsed {
  if (kind === "vor_check") return parseVorCheck(get);
  if (kind === "oil_change") return parseOilChange(get, engines);
  if (kind === "airworthiness_directive" || kind === "service_bulletin") {
    const method = get(FIELDS.directiveMethod).trim();
    if (!method || method.length > 500) {
      return {
        fieldErrors: {
          [FIELDS.directiveMethod]: [
            method
              ? "Keep it under 500 characters."
              : "Enter how it was complied with, e.g. inspected per paragraph (g).",
          ],
        },
      };
    }
    return {
      details: {
        kind,
        method,
        // Only a recurring one has more to end.
        terminating:
          schedule === "recurring" && get(FIELDS.directiveTerminating) === "on",
      },
    };
  }
  if (kind === "nav_database") {
    const cycle = parseCycle(get(FIELDS.navCycle));
    if (!cycle) {
      return {
        fieldErrors: { [FIELDS.navCycle]: ["Choose the cycle installed."] },
      };
    }
    return { details: { kind, cycle: cycle.id } };
  }
  return { details: null };
}

function parseVorCheck(get: Get): Parsed {
  const fieldErrors: Record<string, string[]> = {};
  const method = get(FIELDS.vorMethod) as VorMethod;
  if (!VOR_METHODS.includes(method)) {
    return {
      fieldErrors: { [FIELDS.vorMethod]: ["Choose how it was checked."] },
    };
  }
  const place = get(FIELDS.vorPlace).trim();
  if (!place) {
    fieldErrors[FIELDS.vorPlace] = ["Enter where: the VOT, checkpoint or VOR."];
  } else if (place.length > 100) {
    fieldErrors[FIELDS.vorPlace] = ["Keep it under 100 characters."];
  }

  const limit = VOR_LIMITS[method];
  const fields =
    method === "dual"
      ? [
          {
            name: FIELDS.vorBetween,
            receiver: "Between receivers",
            required: true,
          },
        ]
      : [
          { name: FIELDS.vorNav1, receiver: "NAV 1", required: true },
          // Leave blank with only one receiver.
          { name: FIELDS.vorNav2, receiver: "NAV 2", required: false },
        ];
  const readings: VorCheckDetails["readings"] = [];
  for (const { name, receiver, required } of fields) {
    const typed = get(name).trim();
    if (!typed) {
      if (required) fieldErrors[name] = ["Enter the bearing error in degrees."];
      continue;
    }
    const error = parseDegrees(typed);
    if (error === null) {
      fieldErrors[name] = ["Enter degrees like 2 or -1.5."];
    } else if (Math.abs(error) > limit) {
      // Outside the limit the check doesn't count, so it isn't logged as
      // done.
      fieldErrors[name] = [
        `More than the ±${limit}° allowed for this check. It doesn't count; have the receiver looked at.`,
      ];
    } else {
      readings.push({ receiver, error });
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return { details: { kind: "vor_check", method, place, readings } };
}

function parseOilChange(get: Get, engines: number): Parsed {
  const fieldErrors: Record<string, string[]> = {};
  const quarts: string[] = [];
  engineLabels(engines).forEach((label, engine) => {
    const name = FIELDS.oilQuarts(engine);
    const result = parseAmount(get(name), {
      max: MAX_OIL_QUARTS,
      unit: "quarts",
      missing: `Enter the oil put in${label ? ` the ${label.toLowerCase()} engine` : ""}.`,
    });
    if (result.status === "invalid") fieldErrors[name] = [result.message];
    else if (Number(result.value) === 0) {
      fieldErrors[name] = ["An oil change puts oil in; enter how much."];
    } else quarts.push(result.value);
  });
  const oilType = get(FIELDS.oilType).trim();
  if (!oilType) {
    fieldErrors[FIELDS.oilType] = ["Enter the oil used, e.g. AeroShell W100."];
  } else if (oilType.length > 100) {
    fieldErrors[FIELDS.oilType] = ["Keep it under 100 characters."];
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return {
    details: {
      kind: "oil_change",
      quarts,
      oilType,
      filterReplaced: get(FIELDS.oilFilter) === "on",
      sampleSent: get(FIELDS.oilSample) === "on",
    },
  };
}

const signed = (degrees: number) =>
  `${degrees > 0 ? "+" : degrees < 0 ? "−" : ""}${Math.abs(degrees)}°`;

// One line for the item's history: "VOT at KMSP: NAV 1 +2°, NAV 2 −1°",
// "Left 6.0 qt, right 6.0 qt of AeroShell W100; filter replaced".
export function describeDetails(details: CompletionDetails): string {
  if (details.kind === "nav_database") return `Cycle ${details.cycle}`;
  if ("terminating" in details) {
    return details.terminating
      ? `${details.method}; terminating action`
      : details.method;
  }
  if (details.kind === "vor_check") {
    const readings = details.readings
      .map((r) =>
        details.method === "dual"
          ? `${Math.abs(r.error)}° apart`
          : `${r.receiver} ${signed(r.error)}`,
      )
      .join(", ");
    return `${VOR_METHOD_LABELS[details.method]} at ${details.place}: ${readings}`;
  }
  const labels = engineLabels(details.quarts.length);
  const amounts = details.quarts
    .map((q, i) => {
      const label = i === 0 ? labels[i] : labels[i].toLowerCase();
      return `${label ? `${label} ` : ""}${q} qt`;
    })
    .join(", ");
  const extras = [
    details.filterReplaced && "filter replaced",
    details.sampleSent && "oil sample sent",
  ].filter(Boolean);
  return `${amounts} of ${details.oilType}${extras.length ? `; ${extras.join(", ")}` : ""}`;
}

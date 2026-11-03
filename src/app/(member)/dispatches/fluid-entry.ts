import { perEngine } from "@/lib/engines";
import {
  formatAmount,
  fromTenths,
  MAX_FUEL_GALLONS,
  MAX_OIL_QUARTS,
  parseAmount,
  type TotalizerLog,
  toTenths,
} from "@/lib/fluids";

import type { FluidSetup } from "../flights/fluid-fields";
import {
  ADD_FUEL_FIELD,
  ADD_OIL_FIELDS,
  ADD_REMAINING_FIELDS,
  ADD_RESET_FIELDS,
} from "./fields";

export const ENTRY_FIELDS = [
  ADD_FUEL_FIELD,
  ...ADD_OIL_FIELDS,
  ...ADD_REMAINING_FIELDS,
  ...ADD_RESET_FIELDS,
];

export type FluidEntry = {
  fuelAdded: string;
  oilAdded: string;
  oilAdded2: string | null;
  // Per totalizer, what it showed before fueling and what it was reset
  // to; null for one that wasn't reset.
  resets: ({ remaining: string; reset: string } | null)[];
};

// Fuel or oil added while checked out.  Blank amounts are none, but an
// entry has to add something.  Fueling an aircraft with totalizers needs
// each one's reading before and the value it was reset to; without fuel
// a reset is optional, for a totalizer that drifted.
export function parseFluidEntry(
  formData: FormData,
  { totalizers, engines }: FluidSetup,
):
  | { entry: FluidEntry; fieldErrors?: undefined }
  | { fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {};
  const typed = (name: string) => String(formData.get(name) ?? "").trim();
  const read = (
    name: string,
    max: number,
    unit: string,
    missing: string,
    blank?: string,
  ) => {
    const result = parseAmount(typed(name) || (blank ?? ""), {
      max,
      unit,
      missing,
    });
    if (result.status === "ok") return result.value;
    fieldErrors[name] = [result.message];
    return null;
  };

  const fuel = read(ADD_FUEL_FIELD, MAX_FUEL_GALLONS, "gallons", "", "0");
  const oil = ADD_OIL_FIELDS.slice(0, engines).map((name) =>
    read(name, MAX_OIL_QUARTS, "quarts", "", "0"),
  );
  const fueled = fuel !== null && Number(fuel) > 0;
  const resets = ADD_REMAINING_FIELDS.slice(0, totalizers).map((name, i) => {
    const resetName = ADD_RESET_FIELDS[i];
    if (!fueled && !typed(name) && !typed(resetName)) return null;
    const remaining = read(
      name,
      MAX_FUEL_GALLONS,
      "gallons",
      "Enter what it showed before fueling.",
    );
    const reset = read(
      resetName,
      MAX_FUEL_GALLONS,
      "gallons",
      "Enter what you reset it to.",
    );
    return remaining === null || reset === null ? null : { remaining, reset };
  });

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  if (!fueled && oil.every((q) => Number(q) === 0) && resets.every((r) => !r)) {
    return {
      fieldErrors: { [ADD_FUEL_FIELD]: ["Enter the fuel or oil added."] },
    };
  }
  return {
    entry: {
      fuelAdded: fuel!,
      oilAdded: oil[0]!,
      oilAdded2: engines === 2 ? oil[1]! : null,
      resets,
    },
  };
}

type StoredEntry = {
  fuelAdded: string;
  oilAdded: string;
  oilAdded2: string | null;
  totalizerRemaining: string | null;
  totalizerReset: string | null;
  totalizerRemaining2: string | null;
  totalizerReset2: string | null;
};

// What a dispatch's entries add up to, as decimal strings.
export function fluidTotals(entries: StoredEntry[]) {
  const sum = (amounts: (string | null)[]) =>
    fromTenths(amounts.reduce((t, a) => t + (a === null ? 0 : toTenths(a)), 0));
  return {
    fuel: sum(entries.map((e) => e.fuelAdded)),
    oil: [
      sum(entries.map((e) => e.oilAdded)),
      sum(entries.map((e) => e.oilAdded2)),
    ],
  };
}

// Each of an aircraft's totalizers over a dispatch, from its reading at
// check-out and the entries' resets, oldest first.  Null for one with no
// reading at check-out, which can't be counted: a dispatch from before
// they were recorded, or a totalizer added since.
export function totalizerLogs(
  out: (string | null)[],
  entries: StoredEntry[],
  count: number,
): (TotalizerLog | null)[] {
  const pairs = [
    (e: StoredEntry) => [e.totalizerRemaining, e.totalizerReset],
    (e: StoredEntry) => [e.totalizerRemaining2, e.totalizerReset2],
  ];
  return pairs.slice(0, count).map((pair, i) => {
    const start = out[i];
    if (start === null || start === undefined) return null;
    return {
      out: toTenths(start),
      resets: entries.flatMap((e) => {
        const [remaining, reset] = pair(e);
        return remaining === null || reset === null
          ? []
          : [{ remaining: toTenths(remaining), reset: toTenths(reset) }];
      }),
    };
  });
}

// What one entry added, in a line.
export function describeEntry(
  entry: StoredEntry,
  { totalizers, engines }: FluidSetup,
) {
  const parts = [];
  if (Number(entry.fuelAdded) > 0) {
    parts.push(`${formatAmount(entry.fuelAdded, "gal")} fuel`);
  }
  [entry.oilAdded, entry.oilAdded2].slice(0, engines).forEach((q, i) => {
    if (q !== null && Number(q) > 0) {
      parts.push(`${formatAmount(q, "qt")} ${perEngine("oil", engines, i)}`);
    }
  });
  [
    [entry.totalizerRemaining, entry.totalizerReset],
    [entry.totalizerRemaining2, entry.totalizerReset2],
  ]
    .slice(0, totalizers)
    .forEach(([remaining, reset], i) => {
      if (remaining !== null && reset !== null) {
        parts.push(
          `${perEngine("totalizer", totalizers, i)} ${Number(remaining).toFixed(1)} → ${formatAmount(reset, "gal")}`,
        );
      }
    });
  return parts.join(" · ");
}

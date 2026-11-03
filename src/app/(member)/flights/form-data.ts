import { z } from "zod";

import { checkReading } from "@/lib/flight-rules";
import { MAX_FUEL_GALLONS, MAX_OIL_QUARTS, parseAmount } from "@/lib/fluids";
import { formValues } from "@/lib/form-state";
import { parseHours } from "@/lib/hours";

import { inField } from "./fields";
import type { FluidSetup } from "./fluid-fields";

// Parsing a flight form, shared by checking in (which records a flight),
// a pilot's edit and an officer's correction.  Checking in asks only for
// the totalizers' fuel remaining; the other fuel and oil come from what
// was added while the aircraft was out.

// Allows tomorrow's date: the server runs on UTC, which is already
// tomorrow for an evening flight in the Americas.
function notInFuture(isoDate: string) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return isoDate <= tomorrow.toISOString().slice(0, 10);
}

const amount = (max: number, unit: string, missing: string) =>
  z.string().transform((typed, ctx) => {
    const result = parseAmount(typed, { max, unit, missing });
    if (result.status === "invalid") {
      ctx.addIssue({ code: "custom", message: result.message });
      return z.NEVER;
    }
    return result.value;
  });

// Blank when it isn't known.
const optionalAmount = (max: number, unit: string) =>
  z.string().transform((typed, ctx) => {
    if (typed.trim() === "") return null;
    const result = parseAmount(typed, { max, unit, missing: "" });
    if (result.status === "invalid") {
      ctx.addIssue({ code: "custom", message: result.message });
      return z.NEVER;
    }
    return result.value;
  });

const oil = () =>
  amount(MAX_OIL_QUARTS, "quarts", "Enter the oil added, or 0 if none.");
const remaining = () =>
  amount(
    MAX_FUEL_GALLONS,
    "gallons",
    "Enter the fuel remaining on the totalizer.",
  );

const detailsSchema = z.object({
  date: z.iso
    .date("Enter the date of the flight.")
    .refine(notInFuture, "The date can't be in the future."),
  notes: z
    .string()
    .trim()
    .max(2000, "Keep notes under 2000 characters.")
    .transform((notes) => notes || null),
  // Null wherever the form doesn't ask: on a twin's right engine only
  // for twins, the totalizers only on aircraft with them, and the totals
  // not at check-in.
  fuelAdded: amount(
    MAX_FUEL_GALLONS,
    "gallons",
    "Enter the fuel added, or 0 if none.",
  ).nullable(),
  oilAdded: oil().nullable(),
  oilAdded2: oil().nullable(),
  totalizerFuel: remaining().nullable(),
  totalizerFuel2: remaining().nullable(),
  fuelUsed: optionalAmount(MAX_FUEL_GALLONS, "gallons").nullable(),
  fuelUsed2: optionalAmount(MAX_FUEL_GALLONS, "gallons").nullable(),
});

export type FlightDetails = z.infer<typeof detailsSchema>;

export const DETAIL_FIELDS = [
  "date",
  "notes",
  "fuelAdded",
  "oilAdded",
  "oilAdded2",
  "totalizerFuel",
  "totalizerFuel2",
  "fuelUsed",
  "fuelUsed2",
  "reportSquawk",
];

export type MeterOut = { id: string; out: number };

// Validate the details and each meter's `in` reading, with the same rules
// the form shows live.  Returns the parsed values, or errors keyed by
// field name.
export function parseFlightForm(
  formData: FormData,
  meters: MeterOut[],
  { totalizers, engines }: FluidSetup,
  { checkIn = false } = {},
) {
  const fieldErrors: Record<string, string[]> = {};
  const asked = (name: string, when: boolean) =>
    when ? String(formData.get(name) ?? "") : null;
  const details = detailsSchema.safeParse({
    date: formData.get("date") ?? "",
    notes: formData.get("notes") ?? "",
    fuelAdded: asked("fuelAdded", !checkIn),
    oilAdded: asked("oilAdded", !checkIn),
    oilAdded2: asked("oilAdded2", !checkIn && engines === 2),
    totalizerFuel: asked("totalizerFuel", totalizers >= 1),
    totalizerFuel2: asked("totalizerFuel2", totalizers === 2),
    fuelUsed: asked("fuelUsed", !checkIn && totalizers >= 1),
    fuelUsed2: asked("fuelUsed2", !checkIn && totalizers === 2),
  });
  if (!details.success) {
    Object.assign(fieldErrors, z.flattenError(details.error).fieldErrors);
  }

  const ins = new Map<string, number>();
  for (const { id, out } of meters) {
    const typed = String(formData.get(inField(id)) ?? "");
    const result = checkReading(out, typed, parseHours(typed));
    if (result.status === "empty") {
      fieldErrors[inField(id)] = ["Enter the in reading."];
    } else if (result.status === "invalid") {
      fieldErrors[inField(id)] = [result.message];
    } else {
      ins.set(id, out + result.duration);
    }
  }

  if (!details.success || Object.keys(fieldErrors).length > 0) {
    return { fieldErrors } as const;
  }
  return { details: details.data, ins } as const;
}

export function echo(formData: FormData, meterIds: string[]) {
  return formValues(formData, [...DETAIL_FIELDS, ...meterIds.map(inField)]);
}

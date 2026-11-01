import { z } from "zod";

import { checkReading } from "@/lib/flight-rules";
import { MAX_FUEL_GALLONS, MAX_OIL_QUARTS, parseAmount } from "@/lib/fluids";
import { formValues } from "@/lib/form-state";
import { parseHours } from "@/lib/hours";

import { inField } from "./fields";
import type { FluidSetup } from "./fluid-fields";

// Parsing a flight form, shared by checking in (which records a flight),
// a pilot's edit and an officer's correction.

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

const detailsSchema = z.object({
  date: z.iso
    .date("Enter the date of the flight.")
    .refine(notInFuture, "The date can't be in the future."),
  notes: z
    .string()
    .trim()
    .max(2000, "Keep notes under 2000 characters.")
    .transform((notes) => notes || null),
  fuelAdded: amount(
    MAX_FUEL_GALLONS,
    "gallons",
    "Enter the fuel added, or 0 if none.",
  ),
  oilAdded: amount(
    MAX_OIL_QUARTS,
    "quarts",
    "Enter the oil added, or 0 if none.",
  ),
  // A twin's right engine; only asked for on twins.
  oilAdded2: amount(
    MAX_OIL_QUARTS,
    "quarts",
    "Enter the oil added, or 0 if none.",
  ).nullable(),
  // Only asked for, and so only required, on aircraft with a totalizer.
  totalizerFuel: amount(
    MAX_FUEL_GALLONS,
    "gallons",
    "Enter the fuel remaining on the totalizer.",
  ).nullable(),
});

export const DETAIL_FIELDS = [
  "date",
  "notes",
  "fuelAdded",
  "oilAdded",
  "oilAdded2",
  "totalizerFuel",
  "reportSquawk",
];

export type MeterOut = { id: string; out: number };

// Validate the details and each meter's `in` reading, with the same rules
// the form shows live.  Returns the parsed values, or errors keyed by
// field name.
export function parseFlightForm(
  formData: FormData,
  meters: MeterOut[],
  { totalizer, engines }: FluidSetup,
) {
  const fieldErrors: Record<string, string[]> = {};
  const details = detailsSchema.safeParse({
    date: formData.get("date") ?? "",
    notes: formData.get("notes") ?? "",
    fuelAdded: formData.get("fuelAdded") ?? "",
    oilAdded: formData.get("oilAdded") ?? "",
    oilAdded2: engines === 2 ? (formData.get("oilAdded2") ?? "") : null,
    totalizerFuel: totalizer ? (formData.get("totalizerFuel") ?? "") : null,
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

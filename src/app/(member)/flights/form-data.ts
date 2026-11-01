import { z } from "zod";

import { checkReading } from "@/lib/flight-rules";
import { formValues } from "@/lib/form-state";
import { parseHours } from "@/lib/hours";

import { inField } from "./fields";

// Parsing a flight form, shared by checking in (which records a flight),
// a pilot's edit and an officer's correction.

const landings = z.coerce
  .number<string>("Enter a number.")
  .int("Enter a whole number.")
  .min(0, "Can't be negative.")
  .max(99, "That's a lot of landings.");

// Allows tomorrow's date: the server runs on UTC, which is already
// tomorrow for an evening flight in the Americas.
function notInFuture(isoDate: string) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return isoDate <= tomorrow.toISOString().slice(0, 10);
}

const detailsSchema = z.object({
  date: z.iso
    .date("Enter the date of the flight.")
    .refine(notInFuture, "The date can't be in the future."),
  dayLandings: landings,
  nightLandings: landings,
  notes: z
    .string()
    .trim()
    .max(2000, "Keep notes under 2000 characters.")
    .transform((notes) => notes || null),
});

export const DETAIL_FIELDS = [
  "date",
  "dayLandings",
  "nightLandings",
  "notes",
  "reportSquawk",
];

export type MeterOut = { id: string; out: number };

// Validate the details and each meter's `in` reading, with the same rules
// the form shows live.  Returns the parsed values, or errors keyed by
// field name.
export function parseFlightForm(formData: FormData, meters: MeterOut[]) {
  const fieldErrors: Record<string, string[]> = {};
  const details = detailsSchema.safeParse({
    date: formData.get("date") ?? "",
    dayLandings: formData.get("dayLandings") ?? "",
    nightLandings: formData.get("nightLandings") ?? "",
    notes: formData.get("notes") ?? "",
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

"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { forbidden, notFound, redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { aircraft, flight, flightMeterReading, meter } from "@/db/schema";
import { canEditFlight, checkReading } from "@/lib/flight-rules";
import { type FormState, formValues } from "@/lib/form-state";
import { isUuid } from "@/lib/ids";
import { parseHours, toHours } from "@/lib/hours";
import { requireMember } from "@/lib/session";

import { inField, outField } from "./fields";

const STALE =
  "This aircraft was just updated. Review the out readings and submit again.";
const LOCKED =
  "This flight was locked when the next flight on the aircraft was logged. Ask an officer to change it.";

// Thrown inside a transaction to roll it back.
class StaleReadings extends Error {}
class FlightLocked extends Error {}

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

const DETAIL_FIELDS = [
  "date",
  "dayLandings",
  "nightLandings",
  "notes",
  "reportSquawk",
];

type MeterOut = { id: string; out: number };

// Validate the details and each meter's `in` reading, with the same rules
// the form shows live.  Returns the parsed values, or errors keyed by
// field name.
function parseFlightForm(formData: FormData, meters: MeterOut[]) {
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

function echo(formData: FormData, meterIds: string[]) {
  return formValues(formData, [...DETAIL_FIELDS, ...meterIds.map(inField)]);
}

export async function logFlight(
  aircraftId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember("pilot");
  if (!isUuid(aircraftId)) notFound();

  const plane = await db().query.aircraft.findFirst({
    where: and(eq(aircraft.id, aircraftId), eq(aircraft.active, true)),
    with: { meters: true, billingMeter: true },
  });
  if (!plane) notFound();
  const values = echo(
    formData,
    plane.meters.map((m) => m.id),
  );
  const billingMeter = plane.billingMeter;
  if (!billingMeter) {
    return {
      error:
        "This aircraft has no billing meter yet. Ask an officer to set one.",
      values,
    };
  }

  // The out readings the pilot saw when the form loaded.  If they're
  // missing, the aircraft's meters changed since then.
  const outs: MeterOut[] = [];
  for (const m of plane.meters) {
    const out = parseHours(String(formData.get(outField(m.id)) ?? ""));
    if (out === null) {
      refresh();
      return { error: STALE, values };
    }
    outs.push({ id: m.id, out });
  }

  const parsed = parseFlightForm(formData, outs);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors, values };
  const { details, ins } = parsed;

  let flightId: string;
  try {
    flightId = await db().transaction(async (tx) => {
      // Locking the meters serializes everyone logging on this aircraft:
      // a second submit waits here, then sees the first one's readings.
      const current = await tx
        .select({ id: meter.id, reading: meter.currentReading })
        .from(meter)
        .where(eq(meter.aircraftId, aircraftId))
        .for("update");
      const outById = new Map(outs.map((m) => [m.id, m.out]));
      if (
        current.length !== outs.length ||
        current.some((m) => parseHours(m.reading) !== outById.get(m.id))
      ) {
        throw new StaleReadings();
      }

      const billed = ins.get(billingMeter.id)! - outById.get(billingMeter.id)!;
      const [created] = await tx
        .insert(flight)
        .values({
          aircraftId,
          pilotId: member.id,
          ...details,
          billingMeterKind: billingMeter.kind,
          billedHours: toHours(billed),
        })
        .returning({ id: flight.id });

      await tx.insert(flightMeterReading).values(
        outs.map((m) => ({
          flightId: created.id,
          meterId: m.id,
          out: toHours(m.out),
          in: toHours(ins.get(m.id)!),
        })),
      );
      for (const m of outs) {
        await tx
          .update(meter)
          .set({ currentReading: toHours(ins.get(m.id)!) })
          .where(eq(meter.id, m.id));
      }

      // The previous flight on this aircraft is now final for its pilot.
      // Locking isn't an edit, so leave its updated_at alone.
      await tx
        .update(flight)
        .set({ lockedAt: new Date(), updatedAt: sql`${flight.updatedAt}` })
        .where(
          and(
            eq(flight.aircraftId, aircraftId),
            isNull(flight.lockedAt),
            ne(flight.id, created.id),
          ),
        );

      return created.id;
    });
  } catch (error) {
    if (error instanceof StaleReadings) {
      // Re-render the page so the form shows the new out readings; what
      // the pilot typed is kept.
      refresh();
      return { error: STALE, values };
    }
    throw error;
  }

  // Straight on to the squawk form for this aircraft, which confirms the
  // flight too.
  if (formData.get("reportSquawk") === "on") {
    redirect(`/squawks/new?aircraft=${aircraftId}&flight=${flightId}`);
  }
  redirect(`/flights/${flightId}?saved=logged`);
}

export async function updateFlight(
  flightId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember("pilot");
  if (!isUuid(flightId)) notFound();

  const existing = await db().query.flight.findFirst({
    where: eq(flight.id, flightId),
    with: { readings: { with: { meter: true } } },
  });
  if (!existing) notFound();
  if (existing.pilotId !== member.id) forbidden();
  const values = echo(
    formData,
    existing.readings.map((r) => r.meterId),
  );
  if (!canEditFlight(existing, member.id)) return { error: LOCKED, values };

  // The out readings stay as logged; only what happened in flight changes.
  const outs = existing.readings.map((r) => ({
    id: r.meterId,
    out: parseHours(r.out)!,
  }));
  const parsed = parseFlightForm(formData, outs);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors, values };
  const { details, ins } = parsed;

  try {
    await db().transaction(async (tx) => {
      // Meters first, in the same order as logFlight, so the two can't
      // deadlock; then the flight, to see whether a new one locked it.
      const current = await tx
        .select({ id: meter.id, reading: meter.currentReading })
        .from(meter)
        .where(eq(meter.aircraftId, existing.aircraftId))
        .for("update");
      const [row] = await tx
        .select({ pilotId: flight.pilotId, lockedAt: flight.lockedAt })
        .from(flight)
        .where(eq(flight.id, flightId))
        .for("update");
      if (!row || !canEditFlight(row, member.id)) throw new FlightLocked();

      // An unlocked flight is the aircraft's latest, so its meters should
      // still read what it logged.
      const readingById = new Map(current.map((m) => [m.id, m.reading]));
      for (const r of existing.readings) {
        const reading = readingById.get(r.meterId);
        if (reading === undefined || parseHours(reading) !== parseHours(r.in)) {
          throw new StaleReadings();
        }
      }

      // Billed by the meter kind captured when the flight was logged.
      const billing = existing.readings.find(
        (r) => r.meter.kind === existing.billingMeterKind,
      )!;
      const billed = ins.get(billing.meterId)! - parseHours(billing.out)!;

      await tx
        .update(flight)
        .set({ ...details, billedHours: toHours(billed) })
        .where(eq(flight.id, flightId));
      for (const { id } of outs) {
        const reading = toHours(ins.get(id)!);
        await tx
          .update(flightMeterReading)
          .set({ in: reading })
          .where(
            and(
              eq(flightMeterReading.flightId, flightId),
              eq(flightMeterReading.meterId, id),
            ),
          );
        await tx
          .update(meter)
          .set({ currentReading: reading })
          .where(eq(meter.id, id));
      }
    });
  } catch (error) {
    if (error instanceof FlightLocked) return { error: LOCKED, values };
    if (error instanceof StaleReadings) return { error: STALE, values };
    throw error;
  }

  redirect(`/flights/${flightId}?saved=updated`);
}

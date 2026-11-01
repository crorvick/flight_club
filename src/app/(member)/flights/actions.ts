"use server";

import { and, eq } from "drizzle-orm";
import { forbidden, notFound, redirect } from "next/navigation";

import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import {
  aircraft,
  dispatch,
  flight,
  flightMeterReading,
  member,
  meter,
} from "@/db/schema";
import { changedFields } from "@/lib/audit-diff";
import { requireMaintainer } from "@/lib/captains";
import { canEditFlight } from "@/lib/flight-rules";
import { type FormState, formValues } from "@/lib/form-state";
import { isUuid } from "@/lib/ids";
import { parseHours, toHours } from "@/lib/hours";
import { requireMember } from "@/lib/session";

import { hasTotalizer } from "./data";
import { inField, outField } from "./fields";
import {
  DETAIL_FIELDS,
  echo,
  type MeterOut,
  parseFlightForm,
} from "./form-data";
import { recordFlight } from "./record";

const STALE =
  "This aircraft's meters changed since the page loaded. Review the readings and submit again.";
const LOCKED =
  "This flight was locked when the next flight on the aircraft was logged. Ask an officer to change it.";

// Thrown inside a transaction to roll it back.
class StaleReadings extends Error {}
class FlightLocked extends Error {}
class Rejected extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
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
    with: {
      readings: { with: { meter: true } },
      aircraft: { columns: { hasFuelTotalizer: true } },
    },
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
  const parsed = parseFlightForm(formData, outs, {
    totalizer: hasTotalizer(existing),
  });
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors, values };
  const { details, ins } = parsed;

  try {
    await db().transaction(async (tx) => {
      // Meters first, in the same order as checking in, so the two can't
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

// A correction to any flight, locked or not, by an officer or the
// aircraft's captain.  Unlike a pilot's edit it can change the out
// readings and the pilot, since a typo in a locked flight usually carried
// into the next one's out readings and both need fixing.  The readings
// before and after aren't required to line up with neighbouring flights:
// fixing two flights takes two saves.  Every correction is audited, with
// the reason given.
export async function officerUpdateFlight(
  flightId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireMember();
  if (!isUuid(flightId)) notFound();

  const existing = await db().query.flight.findFirst({
    where: eq(flight.id, flightId),
    with: {
      readings: { with: { meter: true } },
      aircraft: { columns: { hasFuelTotalizer: true } },
    },
  });
  if (!existing) notFound();
  // Officers, and the aircraft's captains.
  const actor = await requireMaintainer(existing.aircraftId);
  const meterIds = existing.readings.map((r) => r.meterId);
  const values = formValues(formData, [
    ...DETAIL_FIELDS,
    "pilotId",
    "reason",
    ...meterIds.map(inField),
    ...meterIds.map(outField),
  ]);

  // Out readings come from the form here, so validate them first and
  // check each in reading against the corrected out.
  const fieldErrors: Record<string, string[]> = {};
  const outs: MeterOut[] = [];
  for (const id of meterIds) {
    const out = parseHours(values[outField(id)]);
    if (out === null) {
      fieldErrors[outField(id)] = ["Enter a reading like 1234.5."];
    } else {
      outs.push({ id, out });
    }
  }
  const parsed = parseFlightForm(formData, outs, {
    totalizer: hasTotalizer(existing),
  });
  if (parsed.fieldErrors) Object.assign(fieldErrors, parsed.fieldErrors);
  const reason = values.reason.trim();
  if (!reason) fieldErrors.reason = ["Say why the flight is being changed."];
  if (!isUuid(values.pilotId)) fieldErrors.pilotId = ["Choose the pilot."];
  if (parsed.fieldErrors || Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }
  const { details, ins } = parsed;

  try {
    await db().transaction(async (tx) => {
      // Meters first, then the flight, in the same order as logging and
      // pilot edits, so none of them can deadlock with another.
      const current = await tx
        .select({ id: meter.id, reading: meter.currentReading })
        .from(meter)
        .where(eq(meter.aircraftId, existing.aircraftId))
        .for("update");
      const [row] = await tx
        .select()
        .from(flight)
        .where(eq(flight.id, flightId))
        .for("update");
      if (!row) throw new StaleReadings();

      const [pilot] = await tx
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.id, values.pilotId), eq(member.active, true)));
      if (!pilot) throw new Rejected("pilotId", "Choose an active member.");

      // The aircraft's latest flight still sets its meters, as when a
      // pilot edits it; they must still read what it logged.
      const latest = row.lockedAt === null;
      if (latest) {
        const readingById = new Map(current.map((m) => [m.id, m.reading]));
        for (const r of existing.readings) {
          const reading = readingById.get(r.meterId);
          if (
            reading === undefined ||
            parseHours(reading) !== parseHours(r.in)
          ) {
            throw new StaleReadings();
          }
        }
      }

      const billing = existing.readings.find(
        (r) => r.meter.kind === existing.billingMeterKind,
      )!;
      const outById = new Map(outs.map((m) => [m.id, m.out]));
      const billed = ins.get(billing.meterId)! - outById.get(billing.meterId)!;

      const next = {
        ...details,
        pilotId: pilot.id,
        billedHours: toHours(billed),
      };
      await tx.update(flight).set(next).where(eq(flight.id, flightId));

      const readingsBefore: Record<string, string> = {};
      const readingsAfter: Record<string, string> = {};
      for (const r of existing.readings) {
        const out = toHours(outById.get(r.meterId)!);
        const inReading = toHours(ins.get(r.meterId)!);
        await tx
          .update(flightMeterReading)
          .set({ out, in: inReading })
          .where(
            and(
              eq(flightMeterReading.flightId, flightId),
              eq(flightMeterReading.meterId, r.meterId),
            ),
          );
        if (latest) {
          await tx
            .update(meter)
            .set({ currentReading: inReading })
            .where(eq(meter.id, r.meterId));
        }
        // Relational queries return numerics without trailing zeros;
        // normalise so before and after compare like for like.
        readingsBefore[r.meter.label] =
          `${toHours(parseHours(r.out)!)}–${toHours(parseHours(r.in)!)}`;
        readingsAfter[r.meter.label] = `${out}–${inReading}`;
      }

      const diff = changedFields(
        {
          date: row.date,
          notes: row.notes,
          fuelAdded: row.fuelAdded,
          oilAdded: row.oilAdded,
          totalizerFuel: row.totalizerFuel,
          pilotId: row.pilotId,
          billedHours: row.billedHours,
          ...readingsBefore,
        },
        { ...next, ...readingsAfter },
      );
      if (!diff.changed) return;
      await writeAudit(tx, {
        actorId: actor.id,
        action: "flight.update",
        entityType: "flight",
        entityId: flightId,
        before: diff.before,
        after: { ...diff.after, reason },
      });
    });
  } catch (error) {
    if (error instanceof StaleReadings) return { error: STALE, values };
    if (error instanceof Rejected) {
      return { fieldErrors: { [error.field]: [error.message] }, values };
    }
    throw error;
  }

  redirect(`/flights/${flightId}?saved=corrected`);
}

// Add a flight that happened but wasn't logged at the time, from the
// paper log or a pilot's word.  Out readings come from the form, as in a
// correction.  A flight that starts at or after every meter's current
// reading is the aircraft's latest and moves the meters on, as checking
// in does; one from before that is history and leaves them alone.  So
// does any flight added while the aircraft is checked out, whose pilot
// confirmed the meters at check-out.  Audited, with where it came from.
export async function addPastFlight(
  aircraftId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!isUuid(aircraftId)) notFound();
  // Officers, and the aircraft's captains.
  const actor = await requireMaintainer(aircraftId);

  const plane = await db().query.aircraft.findFirst({
    where: eq(aircraft.id, aircraftId),
    with: { meters: { columns: { id: true, label: true } } },
  });
  if (!plane) notFound();
  const meterIds = plane.meters.map((m) => m.id);
  const values = formValues(formData, [
    ...DETAIL_FIELDS,
    "pilotId",
    "reason",
    ...meterIds.map(inField),
    ...meterIds.map(outField),
  ]);

  const fieldErrors: Record<string, string[]> = {};
  const outs: MeterOut[] = [];
  for (const id of meterIds) {
    const out = parseHours(values[outField(id)]);
    if (out === null) {
      fieldErrors[outField(id)] = ["Enter a reading like 1234.5."];
    } else {
      outs.push({ id, out });
    }
  }
  const parsed = parseFlightForm(formData, outs, {
    totalizer: plane.hasFuelTotalizer,
  });
  if (parsed.fieldErrors) Object.assign(fieldErrors, parsed.fieldErrors);
  const reason = values.reason.trim();
  if (!reason) {
    fieldErrors.reason = [
      "Say where the flight comes from, e.g. the paper log.",
    ];
  }
  if (!isUuid(values.pilotId)) fieldErrors.pilotId = ["Choose the pilot."];
  if (parsed.fieldErrors || Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }
  const { details, ins } = parsed;

  let flightId: string;
  try {
    flightId = await db().transaction(async (tx) => {
      // Locked, as for logging, so nothing moves them while this decides
      // whether the flight is the latest.
      const current = await tx
        .select({
          id: meter.id,
          kind: meter.kind,
          reading: meter.currentReading,
        })
        .from(meter)
        .where(eq(meter.aircraftId, aircraftId))
        .for("update");
      // A meter added or removed since the page loaded.
      if (
        current.length !== meterIds.length ||
        current.some((m) => !meterIds.includes(m.id))
      ) {
        throw new StaleReadings();
      }
      const [pilot] = await tx
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.id, values.pilotId), eq(member.active, true)));
      if (!pilot) throw new Rejected("pilotId", "Choose an active member.");
      const [billing] = await tx
        .select({ id: aircraft.billingMeterId })
        .from(aircraft)
        .where(eq(aircraft.id, aircraftId));
      const billingMeter = current.find((m) => m.id === billing.id)!;

      const [out] = await tx
        .select({ id: dispatch.id })
        .from(dispatch)
        .where(
          and(eq(dispatch.aircraftId, aircraftId), eq(dispatch.status, "out")),
        );
      const outById = new Map(outs.map((m) => [m.id, m.out]));
      const latest =
        !out &&
        current.every((m) => outById.get(m.id)! >= parseHours(m.reading)!);

      const id = await recordFlight(tx, {
        aircraftId,
        pilotId: pilot.id,
        billingMeter,
        outs,
        ins,
        details,
        latest,
      });
      const labels = new Map(plane.meters.map((m) => [m.id, m.label]));
      await writeAudit(tx, {
        actorId: actor.id,
        action: "flight.create",
        entityType: "flight",
        entityId: id,
        before: null,
        after: {
          aircraftId,
          pilotId: pilot.id,
          ...details,
          ...Object.fromEntries(
            outs.map((m) => [
              labels.get(m.id),
              `${toHours(m.out)}–${toHours(ins.get(m.id)!)}`,
            ]),
          ),
          latest,
          reason,
        },
      });
      return id;
    });
  } catch (error) {
    if (error instanceof StaleReadings) return { error: STALE, values };
    if (error instanceof Rejected) {
      return { fieldErrors: { [error.field]: [error.message] }, values };
    }
    throw error;
  }
  redirect(`/flights/${flightId}?saved=added`);
}

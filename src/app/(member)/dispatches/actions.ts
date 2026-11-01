"use server";

import { and, eq, ne } from "drizzle-orm";
import { forbidden, notFound, redirect } from "next/navigation";

import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import {
  aircraft,
  dispatch,
  dispatchMeterReading,
  dispatchSquawkAck,
  meter,
  squawk,
} from "@/db/schema";
import { hasRole } from "@/lib/access";
import { checkOutReading } from "@/lib/dispatch-rules";
import { aircraftAlerts } from "@/lib/fleet";
import { type FormState, formValues } from "@/lib/form-state";
import { parseHours, toHours } from "@/lib/hours";
import { isUuid } from "@/lib/ids";
import { requireMember } from "@/lib/session";

import { outField } from "../flights/fields";
import { echo, parseFlightForm } from "../flights/form-data";
import { recordFlight } from "../flights/record";
import { ACK_FIELD, expectedField, VFR_ONLY_FIELD } from "./fields";

// Thrown inside a transaction to roll it back with a message.
class Rejected extends Error {}

const CHANGED =
  "This aircraft changed since the page loaded. Review it and check out again.";

// Postgres reports a second dispatch for the same aircraft or pilot as a
// unique violation (dispatch_one_out_per_*), wrapped by Drizzle.
function constraintOf(error: unknown) {
  const cause = (
    error as { cause?: { code?: string; constraint_name?: string } }
  )?.cause;
  return cause?.code === "23505" ? cause.constraint_name : undefined;
}

export async function checkOut(
  aircraftId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const pilot = await requireMember("pilot");
  if (!isUuid(aircraftId)) notFound();

  const plane = await db().query.aircraft.findFirst({
    where: and(eq(aircraft.id, aircraftId), eq(aircraft.active, true)),
    with: { meters: true },
  });
  if (!plane) notFound();
  const values = formValues(
    formData,
    plane.meters.map((m) => outField(m.id)),
  );

  // Grounded aircraft can't go: that's what an officer's resolution is for.
  const alerts = (await aircraftAlerts([plane.id])).get(plane.id)!;
  if (alerts.grounded) {
    return {
      error: `${plane.tailNumber} is grounded and can't be checked out.`,
    };
  }
  // An aircraft limited to VFR can go, once the pilot says that's how
  // they'll fly it.
  if (alerts.vfrOnly && formData.get(VFR_ONLY_FIELD) !== "on") {
    return {
      fieldErrors: {
        [VFR_ONLY_FIELD]: [
          `${plane.tailNumber} can only fly VFR. Confirm you'll fly VFR to check it out.`,
        ],
      },
      values,
    };
  }

  // What the app showed (to detect a change since the page loaded) and
  // what the pilot confirmed reading off the panel.
  const fieldErrors: Record<string, string[]> = {};
  const readings: { meterId: string; expected: number; out: number }[] = [];
  for (const m of plane.meters) {
    const expected = parseHours(
      String(formData.get(expectedField(m.id)) ?? ""),
    );
    if (expected === null) return { error: CHANGED, values };
    const result = checkOutReading(
      expected,
      parseHours(values[outField(m.id)]),
    );
    if (result.status === "invalid") {
      fieldErrors[outField(m.id)] = [result.message];
    } else {
      readings.push({ meterId: m.id, expected, out: expected + result.gap });
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };
  const acked = new Set(formData.getAll(ACK_FIELD).map(String));

  let dispatchId: string;
  try {
    dispatchId = await db().transaction(async (tx) => {
      // Locked so a check-in or correction can't move them underneath us.
      const current = await tx
        .select({ id: meter.id, reading: meter.currentReading })
        .from(meter)
        .where(eq(meter.aircraftId, aircraftId))
        .for("update");
      const byId = new Map(readings.map((r) => [r.meterId, r.expected]));
      if (
        current.length !== readings.length ||
        current.some((m) => parseHours(m.reading) !== byId.get(m.id))
      ) {
        throw new Rejected(CHANGED);
      }

      // Every unresolved squawk must have been read, including any
      // reported while the pilot was on the page.
      const unresolved = await tx
        .select({ id: squawk.id })
        .from(squawk)
        .where(
          and(eq(squawk.aircraftId, aircraftId), ne(squawk.status, "resolved")),
        );
      if (unresolved.some((s) => !acked.has(s.id))) {
        throw new Rejected(
          "Read and acknowledge every open squawk before checking out. One may have just been reported.",
        );
      }

      const [created] = await tx
        .insert(dispatch)
        .values({ aircraftId, pilotId: pilot.id, vfrOnly: alerts.vfrOnly })
        .returning({ id: dispatch.id });
      await tx.insert(dispatchMeterReading).values(
        readings.map((r) => ({
          dispatchId: created.id,
          meterId: r.meterId,
          expected: toHours(r.expected),
          out: toHours(r.out),
        })),
      );
      if (unresolved.length > 0) {
        await tx
          .insert(dispatchSquawkAck)
          .values(
            unresolved.map((s) => ({ dispatchId: created.id, squawkId: s.id })),
          );
      }

      // The panel is the truth: move any meter that's ahead of the app to
      // what it reads, and record the gap for officers to account for.
      const gaps = readings.filter((r) => r.out !== r.expected);
      for (const r of gaps) {
        await tx
          .update(meter)
          .set({ currentReading: toHours(r.out) })
          .where(eq(meter.id, r.meterId));
      }
      if (gaps.length > 0) {
        await writeAudit(tx, {
          actorId: pilot.id,
          action: "dispatch.gap",
          entityType: "dispatch",
          entityId: created.id,
          before: Object.fromEntries(
            gaps.map((r) => [r.meterId, toHours(r.expected)]),
          ),
          after: Object.fromEntries(
            gaps.map((r) => [r.meterId, toHours(r.out)]),
          ),
        });
      }
      return created.id;
    });
  } catch (error) {
    if (error instanceof Rejected) return { error: error.message, values };
    const constraint = constraintOf(error);
    if (constraint === "dispatch_one_out_per_aircraft") {
      return {
        error: `Someone else just checked out ${plane.tailNumber}.`,
        values,
      };
    }
    if (constraint === "dispatch_one_out_per_pilot") {
      return { error: "You already have an aircraft checked out.", values };
    }
    throw error;
  }
  redirect(`/dispatches/${dispatchId}`);
}

// The pilot who checked it out, or an officer, can close a dispatch.
async function closable(dispatchId: string) {
  const member = await requireMember();
  if (!isUuid(dispatchId)) notFound();
  const [row] = await db()
    .select()
    .from(dispatch)
    .where(eq(dispatch.id, dispatchId));
  if (!row) notFound();
  if (row.pilotId !== member.id && !hasRole(member, "officer")) forbidden();
  return { member, row };
}

const NOT_OUT = "This aircraft has already been checked in or cancelled.";

// Cancelling records no flight.  Any meter gap found at check-out stays:
// the meter really does read that.
export async function cancelDispatch(dispatchId: string): Promise<FormState> {
  const { member, row } = await closable(dispatchId);
  const cancelled = await db().transaction(async (tx) => {
    const [updated] = await tx
      .update(dispatch)
      .set({ status: "cancelled", closedAt: new Date(), closedById: member.id })
      .where(and(eq(dispatch.id, dispatchId), eq(dispatch.status, "out")))
      .returning({ pilotId: dispatch.pilotId });
    if (!updated) return false;
    if (updated.pilotId !== member.id) {
      await writeAudit(tx, {
        actorId: member.id,
        action: "dispatch.cancel",
        entityType: "dispatch",
        entityId: dispatchId,
        before: { status: "out" },
        after: { status: "cancelled" },
      });
    }
    return true;
  });
  if (!cancelled) return { error: NOT_OUT };
  redirect(`/check-out?aircraft=${row.aircraftId}&cancelled=1`);
}

// Checking in records the flight, from the out readings confirmed at
// check-out.  Once it's in, the flight is final for the pilot apart from
// the usual edit until the next flight locks it; there's no deleting it.
export async function checkIn(
  dispatchId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, row } = await closable(dispatchId);

  const readings = await db().query.dispatchMeterReading.findMany({
    where: eq(dispatchMeterReading.dispatchId, dispatchId),
    with: { meter: { columns: { kind: true } } },
  });
  const values = echo(
    formData,
    readings.map((r) => r.meterId),
  );
  const outs = readings.map((r) => ({
    id: r.meterId,
    out: parseHours(r.out)!,
  }));
  const [plane] = await db()
    .select({ hasFuelTotalizer: aircraft.hasFuelTotalizer })
    .from(aircraft)
    .where(eq(aircraft.id, row.aircraftId));
  const parsed = parseFlightForm(formData, outs, {
    totalizer: plane.hasFuelTotalizer,
  });
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors, values };
  const { details, ins } = parsed;

  let flightId: string;
  try {
    flightId = await db().transaction(async (tx) => {
      // Meters, then the dispatch, the same order as everything else that
      // takes these locks.
      const current = await tx
        .select({ id: meter.id, reading: meter.currentReading })
        .from(meter)
        .where(eq(meter.aircraftId, row.aircraftId))
        .for("update");
      const [locked] = await tx
        .select({ status: dispatch.status })
        .from(dispatch)
        .where(eq(dispatch.id, dispatchId))
        .for("update");
      if (locked.status !== "out") throw new Rejected(NOT_OUT);

      // Nobody else can fly it while it's out, so only an officer's meter
      // correction could have moved these.
      const outById = new Map(outs.map((m) => [m.id, m.out]));
      if (
        current.length !== outs.length ||
        current.some((m) => parseHours(m.reading) !== outById.get(m.id))
      ) {
        throw new Rejected(
          "An officer changed this aircraft's meters since you checked out. Ask them to sort it out before checking in.",
        );
      }

      const [plane] = await tx
        .select({ billingMeterId: aircraft.billingMeterId })
        .from(aircraft)
        .where(eq(aircraft.id, row.aircraftId));
      const billing = readings.find((r) => r.meterId === plane.billingMeterId);
      if (!billing) {
        throw new Rejected(
          "This aircraft has no billing meter. Ask an officer to set one.",
        );
      }

      const id = await recordFlight(tx, {
        aircraftId: row.aircraftId,
        pilotId: row.pilotId,
        billingMeter: { id: billing.meterId, kind: billing.meter.kind },
        outs,
        ins,
        details,
      });
      await tx
        .update(dispatch)
        .set({
          status: "in",
          flightId: id,
          closedAt: new Date(),
          closedById: member.id,
        })
        .where(eq(dispatch.id, dispatchId));
      return id;
    });
  } catch (error) {
    if (error instanceof Rejected) return { error: error.message, values };
    throw error;
  }

  if (formData.get("reportSquawk") === "on") {
    redirect(`/squawks/new?aircraft=${row.aircraftId}&flight=${flightId}`);
  }
  redirect(`/flights/${flightId}?saved=logged`);
}

export async function reviewGap(dispatchId: string): Promise<FormState> {
  const officer = await requireMember("officer");
  if (!isUuid(dispatchId)) notFound();
  await db().transaction(async (tx) => {
    const [updated] = await tx
      .update(dispatch)
      .set({ gapReviewedAt: new Date(), gapReviewedById: officer.id })
      .where(eq(dispatch.id, dispatchId))
      .returning({ id: dispatch.id });
    if (!updated) return;
    await writeAudit(tx, {
      actorId: officer.id,
      action: "dispatch.review_gap",
      entityType: "dispatch",
      entityId: dispatchId,
      before: null,
      after: { reviewed: true },
    });
  });
  redirect(`/dispatches/${dispatchId}?saved=reviewed`);
}

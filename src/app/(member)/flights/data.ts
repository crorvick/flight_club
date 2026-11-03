import "server-only";

import { and, arrayContains, asc, desc, eq, isNull, ne, or } from "drizzle-orm";

import { db } from "@/db";
import { aircraft, flight, member, squawk } from "@/db/schema";
import { aircraftAlerts } from "@/lib/fleet";
import { isUuid } from "@/lib/ids";
import { byMeterOrder } from "@/lib/meters";

import type { FluidSetup } from "./fluid-fields";

export async function lastFlownAircraftId(pilotId: string) {
  const [row] = await db()
    .select({ aircraftId: flight.aircraftId })
    .from(flight)
    .where(eq(flight.pilotId, pilotId))
    .orderBy(desc(flight.createdAt))
    .limit(1);
  return row?.aircraftId;
}

// Everything checking an aircraft out needs: its meters, what grounds it
// or is due, and the unresolved squawks to acknowledge.
export async function getAircraftForCheckOut(id: string) {
  const plane = await db().query.aircraft.findFirst({
    where: and(eq(aircraft.id, id), eq(aircraft.active, true)),
    with: {
      meters: true,
      squawks: {
        where: ne(squawk.status, "resolved"),
        orderBy: asc(squawk.reportedAt),
        columns: { id: true, description: true, status: true },
      },
    },
  });
  if (!plane) return undefined;
  const alerts = (await aircraftAlerts([plane.id])).get(plane.id)!;
  // What its totalizers showed at the end of its latest flight, for the
  // pilot to confirm.
  const [latest] = await db()
    .select({ one: flight.totalizerFuel, two: flight.totalizerFuel2 })
    .from(flight)
    .where(and(eq(flight.aircraftId, plane.id), isNull(flight.lockedAt)));
  return {
    id: plane.id,
    tailNumber: plane.tailNumber,
    totalizers: [latest?.one ?? null, latest?.two ?? null].slice(
      0,
      plane.fuelTotalizers,
    ),
    meters: plane.meters
      .map((m) => ({
        id: m.id,
        kind: m.kind,
        label: m.label,
        reading: m.currentReading,
        billing: m.id === plane.billingMeterId,
      }))
      .sort(byMeterOrder),
    squawks: plane.squawks.map((s) => ({
      id: s.id,
      description: s.description,
      deferred: s.status === "deferred",
    })),
    alerts,
  };
}

export async function getFlight(id: string) {
  if (!isUuid(id)) return undefined;
  const row = await db().query.flight.findFirst({
    where: eq(flight.id, id),
    with: {
      aircraft: {
        columns: {
          id: true,
          tailNumber: true,
          fuelTotalizers: true,
          engineCount: true,
        },
      },
      pilot: { columns: { id: true, name: true } },
      readings: { with: { meter: true } },
    },
  });
  if (!row) return undefined;
  return {
    ...row,
    readings: row.readings
      .map((r) => ({
        meterId: r.meterId,
        kind: r.meter.kind,
        label: r.meter.label,
        out: r.out,
        in: r.in,
      }))
      .sort(byMeterOrder),
  };
}

export async function recentFlights(pilotId: string, limit = 5) {
  return db()
    .select({
      id: flight.id,
      date: flight.date,
      tailNumber: aircraft.tailNumber,
      billedHours: flight.billedHours,
      lockedAt: flight.lockedAt,
      pilotId: flight.pilotId,
    })
    .from(flight)
    .innerJoin(aircraft, eq(aircraft.id, flight.aircraftId))
    .where(eq(flight.pilotId, pilotId))
    .orderBy(desc(flight.date), desc(flight.createdAt))
    .limit(limit);
}

type StoredFluids = {
  fuelAdded: string | null;
  oilAdded: string | null;
  oilAdded2: string | null;
  totalizerFuel: string | null;
  totalizerFuel2: string | null;
  fuelUsed: string | null;
  fuelUsed2: string | null;
};

// A flight's fuel and oil as a form shows them: a tenth, or blank.
export function fluidValues(flight: StoredFluids) {
  const show = (value: string | null) =>
    value === null ? "" : Number(value).toFixed(1);
  return {
    fuelAdded: show(flight.fuelAdded),
    oilAdded: show(flight.oilAdded),
    oilAdded2: show(flight.oilAdded2),
    totalizerFuel: show(flight.totalizerFuel),
    totalizerFuel2: show(flight.totalizerFuel2),
    fuelUsed: show(flight.fuelUsed),
    fuelUsed2: show(flight.fuelUsed2),
  };
}

// The fuel and oil fields for editing a flight: the aircraft's, plus any
// the flight recorded before the aircraft's settings changed (a totalizer
// since removed, a twin's second engine).
export const fluidSetup = (
  flight: StoredFluids & {
    aircraft: { fuelTotalizers: number; engineCount: number };
  },
): FluidSetup => ({
  totalizers: Math.max(
    flight.aircraft.fuelTotalizers,
    flight.totalizerFuel2 !== null ? 2 : flight.totalizerFuel !== null ? 1 : 0,
  ),
  engines: flight.oilAdded2 !== null ? 2 : flight.aircraft.engineCount,
});

// The pilots a flight can be logged to: active pilots, plus whoever it's
// logged to now, even if they've since lost the tag.
export async function pilotChoices(currentPilotId?: string) {
  return db()
    .select({ id: member.id, name: member.name })
    .from(member)
    .where(
      or(
        and(eq(member.active, true), arrayContains(member.roles, ["pilot"])),
        currentPilotId === undefined
          ? undefined
          : eq(member.id, currentPilotId),
      ),
    )
    .orderBy(asc(member.name));
}

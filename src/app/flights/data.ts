import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { aircraft, flight, squawk } from "@/db/schema";

// Display order for meters: the order pilots read them off the panel.
const METER_ORDER = { hobbs: 0, tach: 1, air_time: 2 } as const;

export type MeterKind = keyof typeof METER_ORDER;

export function byMeterOrder<T extends { kind: MeterKind }>(a: T, b: T) {
  return METER_ORDER[a.kind] - METER_ORDER[b.kind];
}

// An aircraft is grounded while any open squawk on it grounds it; the
// status is never stored, so it can't disagree with the squawks.
async function groundingSquawks(aircraftIds: string[]) {
  if (aircraftIds.length === 0) return [];
  return db()
    .select({
      aircraftId: squawk.aircraftId,
      description: squawk.description,
    })
    .from(squawk)
    .where(
      and(
        inArray(squawk.aircraftId, aircraftIds),
        eq(squawk.status, "open"),
        eq(squawk.grounds, true),
      ),
    )
    .orderBy(asc(squawk.reportedAt));
}

export type AircraftCard = {
  id: string;
  tailNumber: string;
  makeModel: string;
  grounded: boolean;
};

export async function listActiveAircraft(): Promise<AircraftCard[]> {
  const rows = await db()
    .select({
      id: aircraft.id,
      tailNumber: aircraft.tailNumber,
      makeModel: aircraft.makeModel,
    })
    .from(aircraft)
    .where(eq(aircraft.active, true))
    .orderBy(asc(aircraft.tailNumber));
  const grounded = new Set(
    (await groundingSquawks(rows.map((r) => r.id))).map((s) => s.aircraftId),
  );
  return rows.map((r) => ({ ...r, grounded: grounded.has(r.id) }));
}

export async function lastFlownAircraftId(pilotId: string) {
  const [row] = await db()
    .select({ aircraftId: flight.aircraftId })
    .from(flight)
    .where(eq(flight.pilotId, pilotId))
    .orderBy(desc(flight.createdAt))
    .limit(1);
  return row?.aircraftId;
}

// Everything the log form needs for one aircraft.
export async function getAircraftForLog(id: string) {
  const plane = await db().query.aircraft.findFirst({
    where: and(eq(aircraft.id, id), eq(aircraft.active, true)),
    with: { meters: true },
  });
  if (!plane) return undefined;
  const squawks = await groundingSquawks([plane.id]);
  return {
    id: plane.id,
    tailNumber: plane.tailNumber,
    meters: plane.meters
      .map((m) => ({
        id: m.id,
        kind: m.kind,
        label: m.label,
        reading: m.currentReading,
        billing: m.id === plane.billingMeterId,
      }))
      .sort(byMeterOrder),
    groundingSquawks: squawks.map((s) => s.description),
  };
}

export type AircraftForLog = NonNullable<
  Awaited<ReturnType<typeof getAircraftForLog>>
>;

export async function getFlight(id: string) {
  const row = await db().query.flight.findFirst({
    where: eq(flight.id, id),
    with: {
      aircraft: { columns: { id: true, tailNumber: true } },
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

import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { aircraft, flight } from "@/db/schema";
import { groundingSquawks } from "@/lib/fleet";
import { isUuid } from "@/lib/ids";

// Display order for meters: the order pilots read them off the panel.
const METER_ORDER = { hobbs: 0, tach: 1, air_time: 2 } as const;

export type MeterKind = keyof typeof METER_ORDER;

export function byMeterOrder<T extends { kind: MeterKind }>(a: T, b: T) {
  return METER_ORDER[a.kind] - METER_ORDER[b.kind];
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
  if (!isUuid(id)) return undefined;
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

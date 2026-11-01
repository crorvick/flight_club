import "server-only";

import { and, asc, desc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { aircraft, flight, squawk } from "@/db/schema";
import { aircraftAlerts } from "@/lib/fleet";
import { isUuid } from "@/lib/ids";
import { byMeterOrder } from "@/lib/meters";

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

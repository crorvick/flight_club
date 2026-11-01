import "server-only";

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import { aircraft, squawk } from "@/db/schema";

// An aircraft is grounded while any open squawk on it grounds it; the
// status is never stored, so it can't disagree with the squawks.
export async function groundingSquawks(aircraftIds: string[]) {
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

// Every active aircraft with its unresolved squawks, for the fleet page.
export async function fleetStatus() {
  const planes = await db().query.aircraft.findMany({
    where: eq(aircraft.active, true),
    orderBy: asc(aircraft.tailNumber),
    columns: { id: true, tailNumber: true, makeModel: true },
    with: {
      squawks: {
        where: ne(squawk.status, "resolved"),
        orderBy: [desc(squawk.grounds), asc(squawk.reportedAt)],
        columns: {
          id: true,
          description: true,
          grounds: true,
          status: true,
          reportedAt: true,
        },
      },
    },
  });
  return planes.map((plane) => ({
    ...plane,
    // Same rule as groundingSquawks: only an open grounding squawk counts.
    grounded: plane.squawks.some((s) => s.status === "open" && s.grounds),
  }));
}

export async function recentlyResolved(limit = 5) {
  return db().query.squawk.findMany({
    where: eq(squawk.status, "resolved"),
    orderBy: desc(squawk.resolvedAt),
    limit,
    columns: { id: true, description: true, resolvedAt: true },
    with: { aircraft: { columns: { tailNumber: true } } },
  });
}

import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

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

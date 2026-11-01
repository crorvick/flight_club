import "server-only";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import type { Transaction } from "@/db/audit";
import { flight, flightMeterReading, meter } from "@/db/schema";
import { toHours } from "@/lib/hours";
import type { MeterKind } from "@/lib/meters";

import type { MeterOut } from "./form-data";

// Record a flight inside the caller's transaction, which must already hold
// locks on the aircraft's meters and have checked they still read `outs`.
// Moves each meter to its in reading and locks the aircraft's previous
// flight for its pilot.
export async function recordFlight(
  tx: Transaction,
  flightData: {
    aircraftId: string;
    pilotId: string;
    billingMeter: { id: string; kind: MeterKind };
    outs: MeterOut[];
    ins: Map<string, number>;
    details: {
      date: string;
      notes: string | null;
      fuelAdded: string | null;
      oilAdded: string | null;
      totalizerFuel: string | null;
    };
  },
) {
  const { aircraftId, pilotId, billingMeter, outs, ins, details } = flightData;
  const outById = new Map(outs.map((m) => [m.id, m.out]));
  const billed = ins.get(billingMeter.id)! - outById.get(billingMeter.id)!;

  const [created] = await tx
    .insert(flight)
    .values({
      aircraftId,
      pilotId,
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
}

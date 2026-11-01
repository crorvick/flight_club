import "server-only";

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  aircraft,
  dispatch,
  maintenanceItem,
  member,
  squawk,
} from "@/db/schema";
import { maintenanceStatus, type MaintenanceStatus } from "@/lib/maintenance";

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

export type MaintenanceAlert = MaintenanceStatus & {
  id: string;
  name: string;
  groundsWhenOverdue: boolean;
  meterLabel?: string;
};

export type AircraftAlerts = {
  grounded: boolean;
  groundingSquawks: string[];
  // Only items due soon or overdue, most urgent first.
  maintenance: MaintenanceAlert[];
};

export const today = () => new Date().toISOString().slice(0, 10);

// Everything that grounds an aircraft or should be flagged before flying
// it.  An aircraft is grounded while an open squawk grounds it or an item
// set to ground it is overdue.  None of this is stored, so it can't
// disagree with the squawks and maintenance records it comes from.
export async function aircraftAlerts(
  aircraftIds: string[],
): Promise<Map<string, AircraftAlerts>> {
  const alerts = new Map<string, AircraftAlerts>(
    aircraftIds.map((id) => [
      id,
      { grounded: false, groundingSquawks: [], maintenance: [] },
    ]),
  );
  if (aircraftIds.length === 0) return alerts;

  const [squawks, items] = await Promise.all([
    groundingSquawks(aircraftIds),
    db().query.maintenanceItem.findMany({
      where: inArray(maintenanceItem.aircraftId, aircraftIds),
      with: { meter: { columns: { label: true, currentReading: true } } },
    }),
  ]);
  for (const s of squawks) {
    const entry = alerts.get(s.aircraftId)!;
    entry.groundingSquawks.push(s.description);
    entry.grounded = true;
  }
  const date = today();
  for (const item of items) {
    const status = maintenanceStatus(
      { ...item, currentReading: item.meter?.currentReading ?? null },
      date,
    );
    if (status.state === "ok") continue;
    const entry = alerts.get(item.aircraftId)!;
    entry.maintenance.push({
      ...status,
      id: item.id,
      name: item.name,
      groundsWhenOverdue: item.groundsWhenOverdue,
      meterLabel: item.meter?.label,
    });
    if (status.state === "overdue" && item.groundsWhenOverdue) {
      entry.grounded = true;
    }
  }
  for (const entry of alerts.values()) {
    entry.maintenance.sort(
      (a, b) =>
        Number(b.state === "overdue") - Number(a.state === "overdue") ||
        Number(b.groundsWhenOverdue) - Number(a.groundsWhenOverdue),
    );
  }
  return alerts;
}

export type ActiveDispatch = {
  id: string;
  pilotId: string;
  pilotName: string;
  checkedOutAt: Date;
};

// Who has each aircraft checked out right now, if anyone.
export async function activeDispatches(
  aircraftIds: string[],
): Promise<Map<string, ActiveDispatch>> {
  if (aircraftIds.length === 0) return new Map();
  const rows = await db()
    .select({
      id: dispatch.id,
      aircraftId: dispatch.aircraftId,
      pilotId: dispatch.pilotId,
      pilotName: member.name,
      checkedOutAt: dispatch.checkedOutAt,
    })
    .from(dispatch)
    .innerJoin(member, eq(member.id, dispatch.pilotId))
    .where(
      and(
        inArray(dispatch.aircraftId, aircraftIds),
        eq(dispatch.status, "out"),
      ),
    );
  return new Map(rows.map(({ aircraftId, ...d }) => [aircraftId, d]));
}

export type AircraftCard = {
  id: string;
  tailNumber: string;
  makeModel: string;
  grounded: boolean;
  checkedOutTo?: string;
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
  const ids = rows.map((r) => r.id);
  const [alerts, out] = await Promise.all([
    aircraftAlerts(ids),
    activeDispatches(ids),
  ]);
  return rows.map((r) => ({
    ...r,
    grounded: alerts.get(r.id)!.grounded,
    checkedOutTo: out.get(r.id)?.pilotName,
  }));
}

// Every active aircraft with its unresolved squawks and maintenance coming
// due, for the fleet page.
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
  const ids = planes.map((p) => p.id);
  const [alerts, out] = await Promise.all([
    aircraftAlerts(ids),
    activeDispatches(ids),
  ]);
  return planes.map((plane) => {
    const { grounded, maintenance } = alerts.get(plane.id)!;
    return {
      ...plane,
      grounded,
      maintenance,
      checkedOutTo: out.get(plane.id)?.pilotName,
    };
  });
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

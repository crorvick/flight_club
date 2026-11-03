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
import {
  type AircraftStatus,
  type Grounding,
  GROUNDING_LEVELS,
  statusFor,
  worstGrounding,
} from "@/lib/grounding";
import { maintenanceStatus, type MaintenanceStatus } from "@/lib/maintenance";

// Open squawks that restrict flying, at the level each restricts it.
async function restrictingSquawks(aircraftIds: string[]) {
  if (aircraftIds.length === 0) return [];
  return db()
    .select({
      aircraftId: squawk.aircraftId,
      description: squawk.description,
      grounding: squawk.grounding,
    })
    .from(squawk)
    .where(
      and(
        inArray(squawk.aircraftId, aircraftIds),
        eq(squawk.status, "open"),
        ne(squawk.grounding, "none"),
      ),
    )
    .orderBy(asc(squawk.reportedAt));
}

export type MaintenanceAlert = MaintenanceStatus & {
  id: string;
  name: string;
  // What it rules out once overdue.
  grounding: Grounding;
  meterLabel?: string;
};

export type AircraftAlerts = {
  status: AircraftStatus;
  grounded: boolean;
  vfrOnly: boolean;
  squawks: { description: string; grounding: Grounding }[];
  // Only items due soon or overdue, most urgent first.
  maintenance: MaintenanceAlert[];
};

export const today = () => new Date().toISOString().slice(0, 10);

// Everything that grounds an aircraft, limits it to VFR, or should be
// flagged before flying it.  An open squawk, or an overdue maintenance
// item, rules out all flying, IFR only, or nothing; the aircraft's status
// is the most restrictive of them.  None of this is stored, so it can't
// disagree with the squawks and maintenance records it comes from.
export async function aircraftAlerts(
  aircraftIds: string[],
): Promise<Map<string, AircraftAlerts>> {
  const levels = new Map<string, Grounding[]>(
    aircraftIds.map((id) => [id, []]),
  );
  const entries = new Map(
    aircraftIds.map((id) => [
      id,
      {
        squawks: [] as AircraftAlerts["squawks"],
        maintenance: [] as MaintenanceAlert[],
      },
    ]),
  );
  if (aircraftIds.length > 0) {
    const [squawks, items] = await Promise.all([
      restrictingSquawks(aircraftIds),
      db().query.maintenanceItem.findMany({
        where: inArray(maintenanceItem.aircraftId, aircraftIds),
        // Hours intervals count on the aircraft's logbook meter.
        with: {
          aircraft: {
            columns: {},
            with: {
              logbookMeter: { columns: { label: true, currentReading: true } },
            },
          },
        },
      }),
    ]);
    for (const s of squawks) {
      entries.get(s.aircraftId)!.squawks.push(s);
      levels.get(s.aircraftId)!.push(s.grounding);
    }
    const date = today();
    for (const item of items) {
      const status = maintenanceStatus(
        {
          ...item,
          currentReading: item.aircraft.logbookMeter?.currentReading ?? null,
        },
        date,
      );
      if (status.state === "ok") continue;
      const level = item.grounding;
      entries.get(item.aircraftId)!.maintenance.push({
        ...status,
        id: item.id,
        name: item.name,
        grounding: level,
        meterLabel: item.aircraft.logbookMeter?.label,
      });
      if (status.state === "overdue") levels.get(item.aircraftId)!.push(level);
    }
  }

  const severity = (m: MaintenanceAlert) =>
    (m.state === "overdue" ? 10 : 0) + GROUNDING_LEVELS.indexOf(m.grounding);
  return new Map(
    aircraftIds.map((id) => {
      const status = statusFor(worstGrounding(levels.get(id)!));
      const entry = entries.get(id)!;
      entry.maintenance.sort((a, b) => severity(b) - severity(a));
      return [
        id,
        {
          ...entry,
          status,
          grounded: status === "grounded",
          vfrOnly: status === "vfr-only",
        },
      ];
    }),
  );
}

export type ActiveDispatch = {
  id: string;
  pilotId: string;
  pilotName: string;
  // To reach them about it, if they've given one.
  pilotPhone: string | null;
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
      pilotPhone: member.phone,
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
  status: AircraftStatus;
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
    status: alerts.get(r.id)!.status,
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
        orderBy: [desc(squawk.grounding), asc(squawk.reportedAt)],
        columns: {
          id: true,
          description: true,
          grounding: true,
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
    const { status, maintenance } = alerts.get(plane.id)!;
    return {
      ...plane,
      status,
      maintenance,
      checkedOutTo: out.get(plane.id)?.pilotName,
      checkedOutPhone: out.get(plane.id)?.pilotPhone ?? null,
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

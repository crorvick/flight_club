import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { forbidden } from "next/navigation";

import { db } from "@/db";
import {
  aircraft,
  flight,
  flightMeterReading,
  maintenanceCompletion,
  maintenanceItem,
  member,
  meter,
  squawk,
} from "@/db/schema";
import { maintainedAircraft } from "@/lib/captains";
import { parseHours } from "@/lib/hours";
import type { OilChangeDetails } from "@/lib/maintenance-kinds";
import { byMeterOrder } from "@/lib/meters";
import { type OilChange, type OilFlight, oilPeriods } from "@/lib/oil-report";
import { requireMember } from "@/lib/session";

// Reports are for the members who look after aircraft: officers, for
// every aircraft, and plane captains, for their own.
export async function requireReporter() {
  const me = await requireMember();
  const maintained = await maintainedAircraft(me);
  if (maintained !== "all" && maintained.length === 0) forbidden();
  const planes = await db()
    .select({
      id: aircraft.id,
      tailNumber: aircraft.tailNumber,
      makeModel: aircraft.makeModel,
    })
    .from(aircraft)
    .where(maintained === "all" ? undefined : inArray(aircraft.id, maintained))
    .orderBy(asc(aircraft.tailNumber));
  return { me, planes };
}

export type ReportAircraft = Awaited<
  ReturnType<typeof requireReporter>
>["planes"][number];

// The aircraft a report is for: the one asked for if the member may see
// it, else their first.
export function pickAircraft(
  planes: ReportAircraft[],
  requested: string | string[] | undefined,
) {
  if (typeof requested === "string") {
    const plane = planes.find((p) => p.id === requested);
    if (!plane) forbidden();
    return plane;
  }
  return planes[0];
}

const hundredths = (hours: string | null) =>
  hours === null ? null : parseHours(hours);

// Every oil change on the aircraft, and the oil it ran on between them.
export async function oilReport(aircraftId: string) {
  const [plane] = await db()
    .select({
      engines: aircraft.engineCount,
      logbookMeterId: aircraft.logbookMeterId,
    })
    .from(aircraft)
    .where(eq(aircraft.id, aircraftId));
  const logbook = plane.logbookMeterId
    ? (
        await db()
          .select({ label: meter.label, reading: meter.currentReading })
          .from(meter)
          .where(eq(meter.id, plane.logbookMeterId))
      )[0]
    : undefined;

  const changeRows = await db()
    .select({
      completedOn: maintenanceCompletion.completedOn,
      reading: maintenanceCompletion.reading,
      details: maintenanceCompletion.details,
    })
    .from(maintenanceCompletion)
    .innerJoin(
      maintenanceItem,
      eq(maintenanceItem.id, maintenanceCompletion.itemId),
    )
    .where(
      and(
        eq(maintenanceItem.aircraftId, aircraftId),
        sql`${maintenanceCompletion.details}->>'kind' = 'oil_change'`,
      ),
    )
    .orderBy(
      asc(maintenanceCompletion.completedOn),
      asc(maintenanceCompletion.createdAt),
    );
  const changes: OilChange[] = changeRows.map((c) => ({
    completedOn: c.completedOn,
    reading: hundredths(c.reading),
    details: c.details as OilChangeDetails,
  }));

  const flights: OilFlight[] =
    changes.length === 0
      ? []
      : (
          await db()
            .select({
              date: flight.date,
              out: flightMeterReading.out,
              in: flightMeterReading.in,
              oilAdded: flight.oilAdded,
              oilAdded2: flight.oilAdded2,
            })
            .from(flight)
            .leftJoin(
              flightMeterReading,
              and(
                eq(flightMeterReading.flightId, flight.id),
                plane.logbookMeterId
                  ? eq(flightMeterReading.meterId, plane.logbookMeterId)
                  : sql`false`,
              ),
            )
            .where(
              and(
                eq(flight.aircraftId, aircraftId),
                gte(flight.date, changes[0].completedOn),
              ),
            )
        ).map((f) => {
          const out = hundredths(f.out);
          const inReading = hundredths(f.in);
          return {
            date: f.date,
            logbookOut: out,
            logbookHours:
              out === null || inReading === null ? null : inReading - out,
            oilAdded: [f.oilAdded, f.oilAdded2],
          };
        });

  return {
    engines: plane.engines,
    logbook,
    periods: oilPeriods(changes, flights, plane.engines),
  };
}

// What a mechanic wants at an annual: what's been reported since the last
// one, what's been done, and where every recurring item stands.
export async function mechanicReport(aircraftId: string) {
  const [lastAnnual] = await db()
    .select({
      completedOn: maintenanceCompletion.completedOn,
      reading: maintenanceCompletion.reading,
      note: maintenanceCompletion.note,
      by: member.name,
    })
    .from(maintenanceCompletion)
    .innerJoin(
      maintenanceItem,
      eq(maintenanceItem.id, maintenanceCompletion.itemId),
    )
    .leftJoin(member, eq(member.id, maintenanceCompletion.recordedById))
    .where(
      and(
        eq(maintenanceItem.aircraftId, aircraftId),
        eq(maintenanceItem.kind, "annual"),
      ),
    )
    .orderBy(
      desc(maintenanceCompletion.completedOn),
      desc(maintenanceCompletion.createdAt),
    )
    .limit(1);
  const since = lastAnnual?.completedOn;

  const plane = (await db().query.aircraft.findFirst({
    where: eq(aircraft.id, aircraftId),
    with: {
      meters: true,
      logbookMeter: { columns: { label: true, currentReading: true } },
      maintenanceItems: { orderBy: asc(maintenanceItem.name) },
    },
  }))!;

  const [squawks, completions] = await Promise.all([
    // Everything reported since the annual, and anything older still open.
    db().query.squawk.findMany({
      where: and(
        eq(squawk.aircraftId, aircraftId),
        since
          ? or(
              gte(squawk.reportedAt, new Date(`${since}T00:00:00Z`)),
              ne(squawk.status, "resolved"),
            )
          : undefined,
      ),
      orderBy: asc(squawk.reportedAt),
      with: {
        reportedBy: { columns: { name: true } },
        resolvedBy: { columns: { name: true } },
      },
    }),
    db()
      .select({
        id: maintenanceCompletion.id,
        item: maintenanceItem.name,
        completedOn: maintenanceCompletion.completedOn,
        reading: maintenanceCompletion.reading,
        note: maintenanceCompletion.note,
        details: maintenanceCompletion.details,
        by: member.name,
      })
      .from(maintenanceCompletion)
      .innerJoin(
        maintenanceItem,
        eq(maintenanceItem.id, maintenanceCompletion.itemId),
      )
      .leftJoin(member, eq(member.id, maintenanceCompletion.recordedById))
      .where(
        and(
          eq(maintenanceItem.aircraftId, aircraftId),
          since ? gte(maintenanceCompletion.completedOn, since) : undefined,
        ),
      )
      .orderBy(
        asc(maintenanceCompletion.completedOn),
        asc(maintenanceCompletion.createdAt),
      ),
  ]);

  return {
    lastAnnual,
    meters: [...plane.meters].sort(byMeterOrder),
    logbook: plane.logbookMeter,
    items: plane.maintenanceItems,
    squawks,
    completions,
  };
}

// Who flew what, when, between two dates (inclusive), on the given
// aircraft.
export async function flightReport(
  aircraftIds: string[],
  from: string,
  to: string,
) {
  if (aircraftIds.length === 0) return [];
  return db()
    .select({
      id: flight.id,
      date: flight.date,
      aircraftId: flight.aircraftId,
      tailNumber: aircraft.tailNumber,
      pilotId: flight.pilotId,
      pilot: member.name,
      billedHours: flight.billedHours,
      billingMeterKind: flight.billingMeterKind,
      fuelAdded: flight.fuelAdded,
      oilAdded: flight.oilAdded,
      oilAdded2: flight.oilAdded2,
    })
    .from(flight)
    .innerJoin(aircraft, eq(aircraft.id, flight.aircraftId))
    .innerJoin(member, eq(member.id, flight.pilotId))
    .where(
      and(
        inArray(flight.aircraftId, aircraftIds),
        gte(flight.date, from),
        lte(flight.date, to),
      ),
    )
    .orderBy(asc(flight.date), asc(flight.createdAt));
}

import "server-only";

import { and, asc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  aircraft,
  aircraftCheckout,
  flight,
  pilotQualification,
} from "@/db/schema";
import {
  currencySince,
  type MedicalClass,
  type PilotStatus,
} from "@/lib/qualifications";

export type Qualifications = {
  medicalClass: MedicalClass | null;
  medicalExpiresOn: string | null;
  flightReviewOn: string | null;
};

const NONE: Qualifications = {
  medicalClass: null,
  medicalExpiresOn: null,
  flightReviewOn: null,
};

// A member with nothing recorded yet has no row; treat that as all blank.
export async function getQualifications(
  memberId: string,
): Promise<Qualifications> {
  const [row] = await db()
    .select({
      medicalClass: pilotQualification.medicalClass,
      medicalExpiresOn: pilotQualification.medicalExpiresOn,
      flightReviewOn: pilotQualification.flightReviewOn,
    })
    .from(pilotQualification)
    .where(eq(pilotQualification.memberId, memberId));
  return row ?? NONE;
}

export async function getCheckouts(memberId: string) {
  return db()
    .select({
      aircraftId: aircraftCheckout.aircraftId,
      tailNumber: aircraft.tailNumber,
      checkedOutOn: aircraftCheckout.checkedOutOn,
    })
    .from(aircraftCheckout)
    .innerJoin(aircraft, eq(aircraft.id, aircraftCheckout.aircraftId))
    .where(eq(aircraftCheckout.memberId, memberId))
    .orderBy(asc(aircraft.tailNumber));
}

// Landings in the last 90 days, from flights logged here.
export async function recentLandings(memberId: string, today: string) {
  const [row] = await db()
    .select({
      landings: sql<number>`coalesce(sum(${flight.dayLandings} + ${flight.nightLandings}), 0)::int`,
      nightLandings: sql<number>`coalesce(sum(${flight.nightLandings}), 0)::int`,
    })
    .from(flight)
    .where(
      and(eq(flight.pilotId, memberId), gte(flight.date, currencySince(today))),
    );
  return row;
}

// What the pre-flight warnings need to know about a pilot flying a given
// aircraft.
export async function pilotStatus(
  memberId: string,
  aircraftId: string,
  today: string,
): Promise<PilotStatus> {
  const [qualifications, checkouts, landings] = await Promise.all([
    getQualifications(memberId),
    getCheckouts(memberId),
    recentLandings(memberId, today),
  ]);
  return {
    medicalExpiresOn: qualifications.medicalExpiresOn,
    flightReviewOn: qualifications.flightReviewOn,
    checkedOut: checkouts.some((c) => c.aircraftId === aircraftId),
    ...landings,
  };
}

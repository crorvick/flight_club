import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { aircraft, aircraftCheckout, pilotQualification } from "@/db/schema";
import type { MedicalClass, PilotStatus } from "@/lib/qualifications";

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

// What the pre-flight warnings need to know about a pilot flying a given
// aircraft.
export async function pilotStatus(
  memberId: string,
  aircraftId: string,
): Promise<PilotStatus> {
  const [qualifications, checkouts] = await Promise.all([
    getQualifications(memberId),
    getCheckouts(memberId),
  ]);
  return {
    medicalExpiresOn: qualifications.medicalExpiresOn,
    flightReviewOn: qualifications.flightReviewOn,
    checkedOut: checkouts.some((c) => c.aircraftId === aircraftId),
  };
}

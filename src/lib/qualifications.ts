// Pilot qualifications and the warnings shown before a flight (docs/spec.md,
// sections 5 and 6).  Passenger currency isn't tracked: landings aren't
// recorded, and staying current is the pilot's responsibility.

import { dueDate } from "./maintenance";

export const EXPIRING_SOON_DAYS = 30;

export const MEDICAL_CLASSES = [
  "first",
  "second",
  "third",
  "basicmed",
] as const;
export type MedicalClass = (typeof MEDICAL_CLASSES)[number];

export const MEDICAL_LABELS: Record<MedicalClass, string> = {
  first: "First class",
  second: "Second class",
  third: "Third class",
  basicmed: "BasicMed",
};

// A flight review is good through the end of the 24th calendar month
// after the one it was done in.
export function flightReviewExpires(reviewedOn: string) {
  return dueDate(reviewedOn, 24);
}

function daysUntil(today: string, date: string) {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      (24 * 60 * 60 * 1000),
  );
}

export type PilotWarning = {
  // "expired" items are as serious as they sound; "soon" and "notice" are
  // reminders.
  severity: "expired" | "soon" | "notice";
  message: string;
};

export type PilotStatus = {
  medicalExpiresOn: string | null;
  flightReviewOn: string | null;
  checkedOut: boolean;
};

function expiry(
  what: string,
  expiresOn: string | null,
  today: string,
): PilotWarning | undefined {
  if (expiresOn === null) {
    return { severity: "notice", message: `No ${what} on file.` };
  }
  const days = daysUntil(today, expiresOn);
  if (days < 0) {
    return {
      severity: "expired",
      message: `Your ${what} expired on ${expiresOn}.`,
    };
  }
  if (days <= EXPIRING_SOON_DAYS) {
    return {
      severity: "soon",
      message: `Your ${what} expires on ${expiresOn} (${days === 0 ? "today" : `${days} ${days === 1 ? "day" : "days"}`}).`,
    };
  }
  return undefined;
}

// Everything worth telling a pilot before they fly a given aircraft.
// Warnings, not blocks: the pilot is responsible for being legal.
export function pilotWarnings(status: PilotStatus, today: string) {
  const warnings: PilotWarning[] = [];
  const medical = expiry("medical", status.medicalExpiresOn, today);
  if (medical) warnings.push(medical);
  const review = expiry(
    "flight review",
    status.flightReviewOn && flightReviewExpires(status.flightReviewOn),
    today,
  );
  if (review) warnings.push(review);
  if (!status.checkedOut) {
    warnings.push({
      severity: "expired",
      message: "You're not checked out in this aircraft.",
    });
  }
  return warnings;
}

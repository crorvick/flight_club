// Pilot qualifications and the warnings shown before a flight (docs/spec.md,
// sections 5 and 6).

import { dueDate } from "./maintenance";

export const EXPIRING_SOON_DAYS = 30;
export const CURRENCY_DAYS = 90;
export const CURRENCY_LANDINGS = 3;

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

// The first day that counts toward 90-day currency: flights on or after
// it are within the preceding 90 days.
export function currencySince(today: string) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (CURRENCY_DAYS - 1));
  return date.toISOString().slice(0, 10);
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
  // Landings in the last 90 days, from flights logged here.
  landings: number;
  nightLandings: number;
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
  // Only flights logged here count, so say so: a pilot who flies
  // elsewhere may well be current.
  const counted = "counting only flights logged here";
  if (status.landings < CURRENCY_LANDINGS) {
    warnings.push({
      severity: "notice",
      message: `Not current to carry passengers: ${status.landings} of ${CURRENCY_LANDINGS} landings in the last ${CURRENCY_DAYS} days (${counted}).`,
    });
  } else if (status.nightLandings < CURRENCY_LANDINGS) {
    warnings.push({
      severity: "notice",
      message: `Not current to carry passengers at night: ${status.nightLandings} of ${CURRENCY_LANDINGS} night landings in the last ${CURRENCY_DAYS} days (${counted}).`,
    });
  }
  return warnings;
}

// When maintenance comes due, and whether it's due soon or overdue.  The
// next due date and reading are always computed from the last completion,
// never stored, so they can't drift from it.

import { parseHours } from "./hours";

// Early enough to book the shop.
export const DUE_SOON_DAYS = 30;
export const DUE_SOON_HUNDREDTHS = 10 * 100;

export type MaintenanceState = "ok" | "due-soon" | "overdue";

export type MaintenanceInput = {
  intervalMonths: number | null;
  intervalHours: string | null;
  lastCompletedOn: string | null;
  lastCompletedReading: string | null;
  // The interval meter's current reading, when it has an hours interval.
  currentReading: string | null;
};

export type MaintenanceStatus = {
  state: MaintenanceState;
  // Due on or before the end of this day.
  dueOn?: string;
  daysLeft?: number;
  // Due at this meter reading, in hundredths.
  dueAt?: number;
  hoursLeft?: number;
};

// Calendar months, as the FAA counts them for annuals, ELTs, transponders
// and the like: done any day in March, 12 calendar months makes it due at
// the end of March the next year.
export function dueDate(lastCompletedOn: string, months: number) {
  const [year, month] = lastCompletedOn.split("-").map(Number);
  // Day 0 of the month after the target is the target's last day.
  const end = new Date(Date.UTC(year, month - 1 + months + 1, 0));
  return end.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      (24 * 60 * 60 * 1000),
  );
}

const hundredths = (hours: string | null) =>
  hours === null ? null : parseHours(hours);

const SEVERITY: MaintenanceState[] = ["ok", "due-soon", "overdue"];
const worst = (a: MaintenanceState, b: MaintenanceState) =>
  SEVERITY.indexOf(a) >= SEVERITY.indexOf(b) ? a : b;

// `today` is an ISO date.  With both intervals, whichever comes first
// decides.
export function maintenanceStatus(
  item: MaintenanceInput,
  today: string,
): MaintenanceStatus {
  const status: MaintenanceStatus = { state: "ok" };

  if (item.intervalMonths !== null && item.lastCompletedOn !== null) {
    status.dueOn = dueDate(item.lastCompletedOn, item.intervalMonths);
    status.daysLeft = daysBetween(today, status.dueOn);
    const state =
      status.daysLeft < 0
        ? "overdue"
        : status.daysLeft <= DUE_SOON_DAYS
          ? "due-soon"
          : "ok";
    status.state = worst(status.state, state);
  }

  const interval = hundredths(item.intervalHours);
  const last = hundredths(item.lastCompletedReading);
  const current = hundredths(item.currentReading);
  if (interval !== null && last !== null && current !== null) {
    status.dueAt = last + interval;
    status.hoursLeft = status.dueAt - current;
    // Due at the reading itself; flying past it is overdue.
    const state =
      status.hoursLeft < 0
        ? "overdue"
        : status.hoursLeft <= DUE_SOON_HUNDREDTHS
          ? "due-soon"
          : "ok";
    status.state = worst(status.state, state);
  }

  return status;
}

const hoursText = (hundredths: number) =>
  `${(Math.abs(hundredths) / 100).toFixed(1)} hours`;
const daysText = (days: number) =>
  `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}`;

// When it's due, in words, by each limit that applies: "due 2026-12-31
// (30 days)", "5.2 hours overdue on the tach".
export function describeDue(status: MaintenanceStatus, meterLabel?: string) {
  const parts: string[] = [];
  if (status.dueOn !== undefined && status.daysLeft !== undefined) {
    parts.push(
      status.daysLeft < 0
        ? `${daysText(status.daysLeft)} overdue (due ${status.dueOn})`
        : `due ${status.dueOn} (${status.daysLeft === 0 ? "today" : daysText(status.daysLeft)})`,
    );
  }
  if (status.dueAt !== undefined && status.hoursLeft !== undefined) {
    const on = meterLabel ? ` on the ${meterLabel.toLowerCase()}` : "";
    parts.push(
      status.hoursLeft < 0
        ? `${hoursText(status.hoursLeft)} overdue${on}`
        : `due at ${(status.dueAt / 100).toFixed(1)}${on} (${hoursText(status.hoursLeft)} left)`,
    );
  }
  return parts.join(", or ");
}

// When maintenance comes due, and whether it's due soon or overdue.  A
// recurring item's next due date and reading are always computed from
// the last completion, never stored, so they can't drift from it.  One
// done once, or that expires, is due when it says.

import { formatDate } from "./dates";
import { parseHours, toHours } from "./hours";
import type { MaintenanceKind, Schedule } from "./maintenance-kinds";

// Early enough to book the shop, but never more than a quarter of the
// interval: a 30-day VOR check would otherwise always be "due soon".
export const DUE_SOON_DAYS = 30;
export const DUE_SOON_HUNDREDTHS = 10 * 100;

// Closed: done once and for all, or an AD or SB that doesn't apply.
export type MaintenanceState = "ok" | "due-soon" | "overdue" | "closed";

export type MaintenanceInput = {
  // A calendar interval is months or days, not both.  Months run to the
  // end of the month unless dueEndOfMonth is false; days are always exact.
  intervalMonths: number | null;
  intervalDays: number | null;
  dueEndOfMonth: boolean;
  intervalHours: string | null;
  lastCompletedOn: string | null;
  lastCompletedReading: string | null;
  // The interval meter's current reading, when it has an hours interval.
  currentReading: string | null;
  // Recurring unless given.
  schedule?: Schedule;
  kind?: MaintenanceKind;
  // When one done once, or that expires, is due.
  dueOn?: string | null;
  dueReading?: string | null;
  closedOn?: string | null;
  // Why an AD or SB doesn't apply.
  notApplicable?: string | null;
};

export type MaintenanceStatus = {
  state: MaintenanceState;
  // Due on or before the end of this day.
  dueOn?: string;
  daysLeft?: number;
  // Due at this meter reading, in hundredths.
  dueAt?: number;
  hoursLeft?: number;
  // Why it's closed.
  closedOn?: string;
  notApplicable?: string;
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

// An exact number of calendar months, to the same day of the month, or
// the month's last day if it's shorter: 31 January plus one month is 28
// (or 29) February.
export function addMonths(isoDate: string, months: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0));
  return new Date(
    Date.UTC(year, month - 1 + months, Math.min(day, lastDay.getUTCDate())),
  )
    .toISOString()
    .slice(0, 10);
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// When the calendar says it's due, with roughly how many days its
// interval spans for sizing the due-soon window.  A recurring item counts
// from its last completion; anything else has no interval, so gets the
// full window, except a navigation database, which only lasts a cycle.
function calendarDue(item: MaintenanceInput) {
  if ((item.schedule ?? "recurring") !== "recurring") {
    if (!item.dueOn) return undefined;
    return {
      dueOn: item.dueOn,
      spanDays: item.kind === "nav_database" ? 28 : Infinity,
    };
  }
  if (item.lastCompletedOn === null) return undefined;
  const last = item.lastCompletedOn;
  if (item.intervalMonths !== null) {
    return {
      dueOn: item.dueEndOfMonth
        ? dueDate(last, item.intervalMonths)
        : addMonths(last, item.intervalMonths),
      spanDays: item.intervalMonths * 30,
    };
  }
  if (item.intervalDays !== null) {
    return {
      dueOn: addDays(last, item.intervalDays),
      spanDays: item.intervalDays,
    };
  }
  return undefined;
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

// The reading it's due at, in hundredths, with the interval it spans.
function hoursDue(item: MaintenanceInput) {
  if ((item.schedule ?? "recurring") !== "recurring") {
    const due = hundredths(item.dueReading ?? null);
    return due === null ? undefined : { dueAt: due, span: Infinity };
  }
  const interval = hundredths(item.intervalHours);
  const last = hundredths(item.lastCompletedReading);
  if (interval === null || last === null) return undefined;
  return { dueAt: last + interval, span: interval };
}

// `today` is an ISO date.  With both intervals, whichever comes first
// decides.
export function maintenanceStatus(
  item: MaintenanceInput,
  today: string,
): MaintenanceStatus {
  if (item.notApplicable) {
    return { state: "closed", notApplicable: item.notApplicable };
  }
  if (item.closedOn) return { state: "closed", closedOn: item.closedOn };
  const status: MaintenanceStatus = { state: "ok" };

  const calendar = calendarDue(item);
  if (calendar) {
    status.dueOn = calendar.dueOn;
    status.daysLeft = daysBetween(today, status.dueOn);
    const window = Math.min(
      DUE_SOON_DAYS,
      Math.max(1, Math.floor(calendar.spanDays / 4)),
    );
    const state =
      status.daysLeft < 0
        ? "overdue"
        : status.daysLeft <= window
          ? "due-soon"
          : "ok";
    status.state = worst(status.state, state);
  }

  const hours = hoursDue(item);
  const current = hundredths(item.currentReading);
  if (hours && current !== null) {
    status.dueAt = hours.dueAt;
    status.hoursLeft = status.dueAt - current;
    // Due at the reading itself; flying past it is overdue.
    const state =
      status.hoursLeft < 0
        ? "overdue"
        : status.hoursLeft <=
            Math.min(DUE_SOON_HUNDREDTHS, Math.floor(hours.span / 4))
          ? "due-soon"
          : "ok";
    status.state = worst(status.state, state);
  }

  return status;
}

// The reading a 100-hour inspection's next one counts from.  It may run
// up to 10 hours past due to reach a place where it can be done, but
// that time counts toward the next one (14 CFR 91.409(b)): done late, the
// next counts from when it was due; done early, from when it was done.
export function hundredHourFrom(
  reading: string,
  lastFrom: string,
  interval: string,
) {
  return toHours(
    Math.min(
      parseHours(reading)!,
      parseHours(lastFrom)! + parseHours(interval)!,
    ),
  );
}

// The last-done reading of an hours item moving from one meter to
// another, such as when the aircraft's logbook meter changes.  Meters run
// at different rates (tach against Hobbs), so there's no exact
// conversion; keeping the hours it has left is the closest.  Shifts it by
// the gap between the meters' current readings.
export function moveReading(
  lastCompletedReading: string,
  fromCurrent: string,
  toCurrent: string,
) {
  const moved =
    parseHours(lastCompletedReading)! +
    parseHours(toCurrent)! -
    parseHours(fromCurrent)!;
  return toHours(Math.max(0, moved));
}

const hoursText = (hundredths: number) =>
  `${(Math.abs(hundredths) / 100).toFixed(1)} hours`;
const daysText = (days: number) =>
  `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}`;

// When it's due, in words, by each limit that applies: "due 2026-12-31
// (30 days)", "5.2 hours overdue on the tach".
export function describeDue(status: MaintenanceStatus, meterLabel?: string) {
  if (status.notApplicable) return `Not applicable: ${status.notApplicable}`;
  if (status.closedOn) return `Done ${formatDate(status.closedOn)}`;
  const parts: string[] = [];
  if (status.dueOn !== undefined && status.daysLeft !== undefined) {
    parts.push(
      status.daysLeft < 0
        ? `${daysText(status.daysLeft)} overdue (due ${formatDate(status.dueOn)})`
        : `due ${formatDate(status.dueOn)} (${status.daysLeft === 0 ? "today" : daysText(status.daysLeft)})`,
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

// Fuel and oil recorded with a flight: gallons and quarts, to a tenth.

// Well above anything the club's single-engine aircraft hold, so a typo
// like 300 instead of 30.0 is caught.
export const MAX_FUEL_GALLONS = 200;
export const MAX_OIL_QUARTS = 15;

const AMOUNT = /^\d{1,3}(?:\.\d)?$/;

export type AmountCheck =
  { status: "ok"; value: string } | { status: "invalid"; message: string };

// An amount as typed: a number to a tenth, up to `max`, as the decimal
// string the database stores.  `missing` is what to tell the pilot when
// it's left blank; every amount the form asks for is required.
export function parseAmount(
  typed: string,
  { max, unit, missing }: { max: number; unit: string; missing: string },
): AmountCheck {
  const trimmed = typed.trim();
  if (trimmed === "") return { status: "invalid", message: missing };
  if (!AMOUNT.test(trimmed)) {
    return { status: "invalid", message: `Enter ${unit} like 12.5.` };
  }
  const amount = Number(trimmed);
  if (amount > max) {
    return { status: "invalid", message: `That's more than ${max} ${unit}.` };
  }
  return { status: "ok", value: amount.toFixed(1) };
}

// For display: "12.5 gal", "1.0 qt".
export function formatAmount(value: string, unit: "gal" | "qt") {
  return `${Number(value).toFixed(1)} ${unit}`;
}

// Tenths of a gallon or quart, for exact arithmetic on stored amounts.
export const toTenths = (value: string) => Math.round(Number(value) * 10);
export const fromTenths = (tenths: number) => (tenths / 10).toFixed(1);

// One fuel totalizer over a check-out, in tenths of a gallon: the fuel
// remaining it showed at check-out, then for each fueling what it showed
// before and what it was reset to.
export type TotalizerLog = {
  out: number;
  resets: { remaining: number; reset: number }[];
};

// What it should show now: its last reset, else what it showed at
// check-out.
export function lastTotalizer({ out, resets }: TotalizerLog) {
  return resets.at(-1)?.reset ?? out;
}

// A reading against what the totalizer last showed: it only counts down
// between resets, so a higher one is a typo or a reset nobody recorded.
export function checkTotalizer(
  log: TotalizerLog,
  remaining: number,
): { status: "ok" } | { status: "invalid"; message: string } {
  const last = lastTotalizer(log);
  if (remaining <= last) return { status: "ok" };
  const when = log.resets.length > 0 ? "after the last reset" : "at check-out";
  return {
    status: "invalid",
    message: `It showed ${fromTenths(last)} gal ${when}, so it can't show more now.`,
  };
}

// The fuel the totalizer counted over the check-out, ending at `final`:
// the drop to each reading from the reset (or check-out) before it.
// Null if any reading is higher than the one before, which only happens
// when an entry in between was removed.
export function fuelUsed({ out, resets }: TotalizerLog, final: number) {
  let used = 0;
  let previous = out;
  for (const { remaining, reset } of [
    ...resets,
    { remaining: final, reset: final },
  ]) {
    if (remaining > previous) return null;
    used += previous - remaining;
    previous = reset;
  }
  return used;
}

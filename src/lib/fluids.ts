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

// Meter readings are hours to two decimal places.  Arithmetic happens in
// integer hundredths so 0.1 + 0.2 never comes out as 0.30000000000000004;
// decimal strings are only for display and the database.

// What a meter column can hold: numeric(9, 2).
const READING = /^(\d{1,7})(?:\.(\d{1,2}))?$/;

// Parse what a pilot typed, or what Postgres returned, into hundredths.
// Returns null for anything that isn't a plain non-negative reading.
export function parseHours(input: string): number | null {
  const match = READING.exec(input.trim());
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

// Two decimals, as the database stores them: 123456 → "1234.56".
export function toHours(hundredths: number) {
  return (hundredths / 100).toFixed(2);
}

// For display: meters show tenths, so trailing zeros only add noise
// (1234.50 → "1234.5", 1234.00 → "1234.0").
export function formatHours(hundredths: number) {
  const fixed = toHours(hundredths);
  return fixed.endsWith("0") ? fixed.slice(0, -1) : fixed;
}

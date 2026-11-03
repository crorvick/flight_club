// Members' phone numbers, which other members use to reach them.

// The usual ways of writing one: digits, spaces, dots, dashes and
// brackets, with an optional leading +.  Between 7 digits (a local
// number) and 15 (the most E.164 allows).
const PHONE = /^\+?[\d\s().-]+$/;

export type PhoneCheck =
  | { status: "ok"; value: string | null }
  | { status: "invalid"; message: string };

// A phone number as typed, kept as the member wrote it (trimmed, spaces
// collapsed) so it reads the way they expect.  Null when left blank: it's
// optional.
export function parsePhone(typed: string): PhoneCheck {
  const trimmed = typed.trim().replace(/\s+/g, " ");
  if (trimmed === "") return { status: "ok", value: null };
  const digits = trimmed.replace(/\D/g, "").length;
  if (!PHONE.test(trimmed) || digits < 7 || digits > 15) {
    return {
      status: "invalid",
      message: "Enter a phone number like 555-123-4567.",
    };
  }
  return { status: "ok", value: trimmed };
}

// For a tel: link, which wants only the digits and any leading +.
export function telHref(phone: string) {
  return `tel:${phone.startsWith("+") ? "+" : ""}${phone.replace(/\D/g, "")}`;
}

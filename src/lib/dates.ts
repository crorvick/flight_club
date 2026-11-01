// Dates as people read them.  Calendar dates (a flight's date, when a
// medical expires) are stored as "YYYY-MM-DD" with no time zone, so they
// are formatted as UTC to keep the day they name.  Instants are shown in
// the viewer's own time zone by <LocalTime>.

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const DATE_WITH_WEEKDAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

// "Oct 25, 2026", or "Sun, Oct 25, 2026".
export function formatDate(
  isoDate: string,
  { weekday = false }: { weekday?: boolean } = {},
) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return (weekday ? DATE_WITH_WEEKDAY : DATE).format(date);
}

export type InstantFormat = "date" | "datetime" | "time";

const DATE_PART: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
};
const TIME_PART: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

function format(
  at: Date,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
) {
  // Newer ICU puts a narrow no-break space before AM/PM; older ones a
  // plain space.  The server's and the browser's must agree.
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone })
    .format(at)
    .replace(/\s/g, " ");
}

// "Nov 1, 2026", "Sun, Nov 1, 7:53 AM" or "7:53 AM", in the given time
// zone (the runtime's own when omitted).  The date and time are formatted
// separately: browsers join them differently ("Sun, Nov 1 at 7:53 AM"),
// and the server's text and the browser's must match.
export function formatInstant(
  at: Date,
  kind: InstantFormat,
  timeZone?: string,
) {
  switch (kind) {
    case "date":
      return format(
        at,
        { month: "short", day: "numeric", year: "numeric" },
        timeZone,
      );
    case "time":
      return format(at, TIME_PART, timeZone);
    case "datetime":
      return `${format(at, DATE_PART, timeZone)}, ${format(at, TIME_PART, timeZone)}`;
  }
}

// AIRAC cycles, the 28-day schedule navigation databases are published
// on.  Cycle 2001 took effect on 2 January 2020; each is named for the
// year it takes effect in and its place in that year, so most years have
// 13 and a few, like 2020, have 14.

const EPOCH = Date.UTC(2020, 0, 2);
const DAY = 24 * 60 * 60 * 1000;
const CYCLE_DAYS = 28;

const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);

export type Cycle = {
  // "2612"
  id: string;
  // The first and last days it's current.
  effective: string;
  ends: string;
};

function cycleAt(index: number): Cycle {
  const start = EPOCH + index * CYCLE_DAYS * DAY;
  const year = new Date(start).getUTCFullYear();
  const first = Math.ceil((Date.UTC(year, 0, 1) - EPOCH) / (CYCLE_DAYS * DAY));
  const effective = new Date(start).toISOString().slice(0, 10);
  return {
    id: `${String(year % 100).padStart(2, "0")}${String(index - first + 1).padStart(2, "0")}`,
    effective,
    ends: addDays(effective, CYCLE_DAYS - 1),
  };
}

const indexOn = (isoDate: string) =>
  Math.floor((Date.parse(`${isoDate}T00:00:00Z`) - EPOCH) / (CYCLE_DAYS * DAY));

// The cycle current on a day, with `offset` cycles before or after it.
export function cycleOn(isoDate: string, offset = 0) {
  return cycleAt(indexOn(isoDate) + offset);
}

// "2612" back to its cycle, or null if there's no such cycle.
export function parseCycle(id: string): Cycle | null {
  const match = /^(\d{2})(\d{2})$/.exec(id.trim());
  if (!match) return null;
  const year = 2000 + Number(match[1]);
  const first = Math.ceil((Date.UTC(year, 0, 1) - EPOCH) / (CYCLE_DAYS * DAY));
  const cycle = cycleAt(first + Number(match[2]) - 1);
  return cycle.id === id.trim() ? cycle : null;
}

// What a database update installs: the next cycle once it's within a
// week, as it's published ahead of taking effect, else the current one.
export function cyclesToInstall(isoDate: string) {
  const current = cycleOn(isoDate);
  const next = cycleOn(isoDate, 1);
  const soon = indexOn(addDays(isoDate, 7)) > indexOn(isoDate);
  return { options: [current, next], suggested: soon ? next : current };
}

// What the maintenance forms offer: the last, current and next cycles
// for an item's, the current and next for logging an update.
export function cycleChoice(isoDate: string) {
  const install = cyclesToInstall(isoDate);
  return {
    recent: [-1, 0, 1].map((offset) => cycleOn(isoDate, offset)),
    current: cycleOn(isoDate).id,
    toInstall: install.options,
    suggested: install.suggested.id,
  };
}

export type CycleChoice = ReturnType<typeof cycleChoice>;

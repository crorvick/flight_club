// Engines on an aircraft: the club flies singles, and may manage twins.
// Anything per engine (oil added, oil changes) is asked for once per
// engine, labelled left and right on a twin.

export const MAX_ENGINES = 2;

// "" for a single, whose one engine needs no name.
export function engineLabels(count: number): string[] {
  return count === 2 ? ["Left", "Right"] : [""];
}

// "Oil added" on a single, "Oil added, left" on a twin; the same for fuel
// totalizers, when a twin has one per engine.
export function perEngine(label: string, count: number, index: number) {
  const which = engineLabels(count)[index].toLowerCase();
  return which ? `${label}, ${which}` : label;
}

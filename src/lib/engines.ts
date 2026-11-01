// Engines on an aircraft: the club flies singles, and may manage twins.
// Anything per engine (oil added, oil changes) is asked for once per
// engine, labelled left and right on a twin.

export const MAX_ENGINES = 2;

// "" for a single, whose one engine needs no name.
export function engineLabels(count: number): string[] {
  return count === 2 ? ["Left", "Right"] : [""];
}

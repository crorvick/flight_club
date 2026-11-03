// Form field names for a meter's readings, shared by the form and the
// actions that read it.
export const inField = (meterId: string) => `in:${meterId}`;
export const outField = (meterId: string) => `out:${meterId}`;

// What each fuel totalizer shows at the end of a flight.
export const TOTALIZER_FIELDS = ["totalizerFuel", "totalizerFuel2"] as const;

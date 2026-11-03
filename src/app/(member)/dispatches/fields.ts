// Form field names for checking out: the reading the app showed for each
// meter, and the one the pilot confirmed (outField, shared with flights).
export const expectedField = (meterId: string) => `expected:${meterId}`;
export const ACK_FIELD = "ack";
export const VFR_ONLY_FIELD = "vfrOnly";
// What each fuel totalizer shows at check-out.
export const TOTALIZER_OUT_FIELDS = ["totalizerOut", "totalizerOut2"] as const;

// Fuel or oil added while checked out.  Named apart from the check-in
// form's fields, which share the page.
export const ADD_FUEL_FIELD = "addFuel";
export const ADD_OIL_FIELDS = ["addOil", "addOil2"] as const;
export const ADD_REMAINING_FIELDS = ["addRemaining", "addRemaining2"] as const;
export const ADD_RESET_FIELDS = ["addReset", "addReset2"] as const;

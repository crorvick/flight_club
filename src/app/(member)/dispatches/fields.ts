// Form field names for checking out: the reading the app showed for each
// meter, and the one the pilot confirmed (outField, shared with flights).
export const expectedField = (meterId: string) => `expected:${meterId}`;
export const ACK_FIELD = "ack";
export const VFR_ONLY_FIELD = "vfrOnly";

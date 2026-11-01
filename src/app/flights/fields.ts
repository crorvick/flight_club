// Form field names for a meter's readings, shared by the form and the
// actions that read it.
export const inField = (meterId: string) => `in:${meterId}`;
export const outField = (meterId: string) => `out:${meterId}`;

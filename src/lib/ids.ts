import { z } from "zod";

const uuid = z.uuid();

// Ids come from URLs, and Postgres rejects a malformed uuid with an error
// rather than finding nothing, so check before querying.
export function isUuid(value: string) {
  return uuid.safeParse(value).success;
}

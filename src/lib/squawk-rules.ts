// Rules for reporting squawks (docs/spec.md, sections 6 and 7), shared by
// the form and the server action.

export const SQUAWK_CATEGORIES = [
  "engine",
  "avionics",
  "airframe",
  "other",
] as const;

export type SquawkCategory = (typeof SQUAWK_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<SquawkCategory, string> = {
  engine: "Engine",
  avionics: "Avionics",
  airframe: "Airframe",
  other: "Other",
};

// The browser shrinks photos to about 1600px JPEGs (a few hundred KB)
// before upload, so these only bite when that fails and the original is
// sent instead.
export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function checkPhotos(photos: { type: string; size: number }[]) {
  if (photos.length > MAX_PHOTOS) {
    return `Attach at most ${MAX_PHOTOS} photos.`;
  }
  if (photos.some((p) => !(p.type in PHOTO_TYPES))) {
    return "Photos must be JPEG, PNG or WebP images.";
  }
  if (photos.some((p) => p.size > MAX_PHOTO_BYTES)) {
    return "A photo is too large. Try taking it again.";
  }
  return undefined;
}

export type SquawkStatus = "open" | "deferred" | "resolved";
export type SquawkChange = "resolve" | "defer" | "reopen";

export const STATUS_LABELS: Record<SquawkStatus, string> = {
  open: "Open",
  deferred: "Deferred",
  resolved: "Resolved",
};

// What an officer can do with a squawk.  Deferring a grounding squawk
// would unground the aircraft without anyone saying what was done about
// it, so a grounding squawk can only be resolved, with a note.
export function allowedChanges(squawk: {
  status: SquawkStatus;
  grounds: boolean;
}): SquawkChange[] {
  switch (squawk.status) {
    case "open":
      return squawk.grounds ? ["resolve"] : ["resolve", "defer"];
    case "deferred":
      return ["resolve", "reopen"];
    case "resolved":
      return [];
  }
}

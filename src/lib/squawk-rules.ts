// Rules for reporting squawks (docs/spec.md, sections 6 and 7), shared by
// the form and the server action.

export const SQUAWK_CATEGORIES = [
  "engine",
  "avionics",
  "airframe",
  "other",
] as const;

export type SquawkCategory = (typeof SQUAWK_CATEGORIES)[number];

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

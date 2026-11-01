import { describe, expect, it } from "vitest";

import {
  allowedChanges,
  checkPhotos,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
} from "./squawk-rules";

const jpeg = { type: "image/jpeg", size: 300_000 };

describe("checkPhotos", () => {
  it("accepts no photos", () => {
    expect(checkPhotos([])).toBeUndefined();
  });

  it("accepts up to the limit", () => {
    expect(checkPhotos(Array(MAX_PHOTOS).fill(jpeg))).toBeUndefined();
  });

  it("rejects too many photos", () => {
    expect(checkPhotos(Array(MAX_PHOTOS + 1).fill(jpeg))).toMatch(/at most 4/);
  });

  it("rejects types the browser can't show everywhere", () => {
    expect(checkPhotos([{ type: "image/heic", size: 1000 }])).toMatch(
      /JPEG, PNG or WebP/,
    );
    expect(checkPhotos([{ type: "application/pdf", size: 1000 }])).toMatch(
      /JPEG, PNG or WebP/,
    );
  });

  it("rejects an oversized photo", () => {
    expect(
      checkPhotos([{ type: "image/png", size: MAX_PHOTO_BYTES + 1 }]),
    ).toMatch(/too large/);
  });
});

describe("allowedChanges", () => {
  it("lets a non-grounding squawk be resolved or deferred", () => {
    expect(allowedChanges({ status: "open", grounds: false })).toEqual([
      "resolve",
      "defer",
    ]);
  });

  it("only lets a grounding squawk be resolved", () => {
    expect(allowedChanges({ status: "open", grounds: true })).toEqual([
      "resolve",
    ]);
  });

  it("lets a deferred squawk be resolved or reopened", () => {
    expect(allowedChanges({ status: "deferred", grounds: false })).toEqual([
      "resolve",
      "reopen",
    ]);
  });

  it("allows nothing once resolved", () => {
    expect(allowedChanges({ status: "resolved", grounds: true })).toEqual([]);
  });
});

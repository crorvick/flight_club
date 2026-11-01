import { describe, expect, it } from "vitest";

import { notesFor, RELEASE_NOTES, type ReleaseNote } from "./release-notes";

describe("RELEASE_NOTES", () => {
  it("is numbered newest first, one apart, so no member skips one", () => {
    RELEASE_NOTES.forEach((note, i) => {
      expect(note.id).toBe(RELEASE_NOTES.length - i);
      expect(note.highlights.length).toBeGreaterThan(0);
    });
  });
});

describe("notesFor", () => {
  const notes: ReleaseNote[] = [
    {
      id: 3,
      date: "2026-12-01",
      highlights: [{ text: "Officers only", for: ["officer"] }],
    },
    {
      id: 2,
      date: "2026-11-15",
      highlights: [
        { text: "Everyone" },
        { text: "Captains", for: ["captain"] },
      ],
    },
  ];

  it("keeps what's meant for the member and drops empty releases", () => {
    expect(notesFor(notes, ["pilot"])).toEqual([
      { id: 2, date: "2026-11-15", highlights: [{ text: "Everyone" }] },
    ]);
    expect(
      notesFor(notes, ["pilot", "captain"]).flatMap((n) =>
        n.highlights.map((h) => h.text),
      ),
    ).toEqual(["Everyone", "Captains"]);
    expect(notesFor(notes, ["officer"]).map((n) => n.id)).toEqual([3, 2]);
  });
});

// What's new, shown to each member once, the first time they open the app
// after a release.  Someone who missed several releases sees every one
// they missed, newest first.
//
// With each release that changes something members would notice, add an
// entry at the top with the next number: a few short bullets in their
// terms, not the commit log.  A bullet only some members care about can
// say who it's for; members without that role don't see it.  Never
// renumber or remove an entry: members' place in this list is stored by
// number (member.last_seen_release_note).

export type Audience = "pilot" | "officer" | "captain";

export type ReleaseNote = {
  // Increasing by one with each entry.
  id: number;
  // When it went out, for the heading.
  date: string;
  highlights: { text: string; for?: Audience[] }[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: 3,
    date: "2026-11-03",
    highlights: [
      {
        text: "Sign in with Google or Apple: link either in Settings, then use it instead of your password.",
      },
      {
        text: "The flight report can count hours on the Hobbs, tach or air time instead of billed hours.",
        for: ["officer", "captain"],
      },
      {
        text: "Track airworthiness directives and service bulletins, including ones that don't apply. The mechanic's report lists each with how it was complied with.",
        for: ["officer", "captain"],
      },
      {
        text: "Maintenance items can be done once, or expire on a date and be renewed. New kinds cover 100-hour inspections and navigation database updates.",
        for: ["officer", "captain"],
      },
    ],
  },
  {
    id: 2,
    date: "2026-11-02",
    highlights: [
      {
        text: "Add fuel and oil each time you put some in while an aircraft is checked out. Checking in totals them for you.",
      },
      {
        text: "On aircraft with a fuel totalizer, confirm it at check-out and note what you reset it to when fueling; the flight shows the fuel used.",
      },
      {
        text: "Add your phone number in Settings, where you can now change your email too. The member directory, in the account menu, shows how to reach everyone.",
      },
      {
        text: "An aircraft's settings say how many fuel totalizers it has: none, one, or one per engine on a twin.",
        for: ["officer"],
      },
      {
        text: "Aircraft, Members and Reports are now under Manage, with your profile back in its own tab.",
        for: ["officer"],
      },
      {
        text: "Manage takes you straight to your aircraft's maintenance and flights, and to reports.",
        for: ["captain"],
      },
    ],
  },
  {
    id: 1,
    date: "2026-11-01",
    highlights: [
      {
        text: "Settings, in the account menu: change your name or password, and choose light or dark for each device.",
      },
      {
        text: "Officers can make members plane captains of an aircraft, to look after its squawks and maintenance.",
        for: ["officer"],
      },
      {
        text: "As a plane captain you can resolve squawks, log maintenance and correct flights on your aircraft, from its card on the Fleet page.",
        for: ["captain"],
      },
      {
        text: "Add a flight that wasn't logged at the time from an aircraft's Flights page.",
        for: ["officer", "captain"],
      },
      {
        text: "Logging a VOR check or oil change asks for what the logbook needs: bearing errors, oil per engine and the oil used.",
        for: ["officer", "captain"],
      },
      {
        text: "Reports, on a tablet or computer: oil use between changes, a mechanic's report of everything since the annual, and who flew what. Each saves as a PDF.",
        for: ["officer", "captain"],
      },
    ],
  },
];

export const LATEST_RELEASE_NOTE = RELEASE_NOTES[0]?.id ?? 0;

// The entries a member hasn't seen, newest first, with only the bullets
// meant for them; entries left with none are dropped.
export function unseenNotes(
  lastSeen: number,
  audiences: readonly Audience[],
): ReleaseNote[] {
  return notesFor(
    RELEASE_NOTES.filter((note) => note.id > lastSeen),
    audiences,
  );
}

export function notesFor(
  notes: ReleaseNote[],
  audiences: readonly Audience[],
): ReleaseNote[] {
  return notes
    .map((note) => ({
      ...note,
      highlights: note.highlights.filter(
        (h) => !h.for || h.for.some((a) => audiences.includes(a)),
      ),
    }))
    .filter((note) => note.highlights.length > 0);
}

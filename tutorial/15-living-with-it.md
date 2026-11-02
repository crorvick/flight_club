# Chapter 15. Living With It

Launching an app is the beginning, not the end. Flight Club will be
used for years, by people who depend on its records, and maintained by
someone part-time who may not remember why anything was done the way
it was. This last chapter is about keeping a live system healthy while
it changes: evolving the schema without downtime, protecting the data,
telling users what's new, and leaving the code in a state your future
self will thank you for.

In this chapter you'll learn:

- How to change a database schema while the old code is still running
- How to back up, and actually restore, a production database
- How to tell members what changed in each release
- How to keep a codebase understandable over years
- Where to go from here

## Changing the Schema Under a Running App

During a deploy (Chapter 14), the sequence is: migrations run, _then_
the new code starts, _then_ traffic moves to it. For a short window, the
**old code runs against the new schema**. And if you roll back, the old
code runs against the new schema indefinitely. So every migration must
be compatible with the code that's currently live.

The technique is called **expand and contract** (or "parallel change"):

1. **Expand.** Add the new structure alongside the old one: a new column
   (nullable, or with a default), a new table. Backfill it from the old
   data in the migration. Release code that reads the new structure and
   no longer depends on the old.
2. **Contract.** In a _later_ release, once nothing running reads the
   old structure, remove it.

Flight Club did exactly this when maintenance items' hours intervals
moved from "each item names its own meter" to "every item counts on the
aircraft's logbook meter":

```sql
-- drizzle/0010_logbook_meter.sql (expand, excerpt)
ALTER TABLE "aircraft" ADD COLUMN "logbook_meter_id" uuid;
-- Backfill: the meter most of an aircraft's items counted on, else its
-- tach, else the meter it's billed by.
UPDATE "aircraft" a SET "logbook_meter_id" = coalesce(
  (SELECT i."meter_id" FROM "maintenance_item" i ... LIMIT 1),
  (SELECT m."id" FROM "meter" m WHERE m."aircraft_id" = a."id" AND m."kind" = 'tach'),
  a."billing_meter_id"
);
```

```sql
-- drizzle/0011_drop_item_meter.sql (contract, a later release)
-- Hours intervals count on the aircraft's logbook meter (0010), which
-- every release now running reads instead.
ALTER TABLE "maintenance_item" DROP COLUMN "meter_id";
```

The release containing 0010 still had the old column, so rolling back
from it was safe. Only after that release was in production did 0011
remove it.

A few rules follow from this:

- **Never rename a column in one step.** Add the new one, copy, switch
  the code, and drop the old one later.
- **Adding `NOT NULL` needs a default or a backfill first**, or the
  migration fails on existing rows (and old code inserting without the
  column fails too).
- **Changing an enum is a careful operation.** Adding a value is
  backward compatible; removing or renaming one isn't. And recall from
  Chapter 5 that adding a value and using it in the same migration run
  needs the type rebuilt.
- **Large tables need care.** Some `ALTER TABLE` operations lock the
  table or rewrite it entirely. For a flying club's thousands of rows
  it doesn't matter; for millions, read PostgreSQL's documentation on
  which operations are instant.

> [!TIP]
> Write a comment at the top of any migration that does more than
> drizzle-kit generated, saying _why_. The SQL shows what it does; only
> the comment says why it's safe.

## Backups and Restores

The database is the club's records. Losing it would be a disaster, so
protection comes in layers.

**Point-in-time recovery.** Render's paid PostgreSQL plans keep
continuous backups (the database's write-ahead log) and can restore it
to its state at _any moment_ in the last several days. This is the
remedy for the most common disaster, which isn't hardware failure but
human error: an officer deletes the wrong thing, or a bad migration
corrupts a column. You restore to a minute before the mistake.

A restore creates a **new** database, leaving the damaged one untouched
until you've checked the restored one. Then you point the service's
`DATABASE_URL` at it, and update `render.yaml` to match so a future
Blueprint sync doesn't undo the change. The full procedure is in
`docs/deploy.md`.

**Your own logical backups.** For anything older than the platform
keeps, take your own dumps now and then, for example before a risky
migration:

```sh
docker run --rm -v "$PWD:/backup" postgres:18-alpine \
  pg_dump --format=custom --file=/backup/flightclub-$(date +%F).dump \
  "<external-database-url>"
```

Store them somewhere other than the hosting provider, so one account
problem can't take both the database and its backups.

> [!IMPORTANT]
> **A backup you've never restored is a hope, not a backup.** Practice
> the whole restore procedure on staging, before there's real data at
> stake, and write down every step that surprised you.

**Photos** are separate (Chapter 10). The object store is highly
durable, but a deleted object is gone unless versioning or a second
copy is configured. Decide whether that matters and write the decision
down.

## Telling Members What's New

Members won't read a changelog, and they shouldn't have to read commit
messages. Flight Club shows each member a short "What's new" popup the
first time they open the app after a release, listing the highlights
they missed, in their terms.

The notes live in code, newest first:

```ts
// src/lib/release-notes.ts (excerpt)
// With each release that changes something members would notice, add an
// entry at the top with the next number: a few short bullets in their
// terms, not the commit log.  A bullet only some members care about can
// say who it's for; members without that role don't see it.  Never
// renumber or remove an entry: members' place in this list is stored by
// number (member.last_seen_release_note).
export const RELEASE_NOTES: ReleaseNote[] = [
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
      // ...
    ],
  },
];
```

Each member row stores the number of the newest note they've seen. A
pure function picks what to show:

```ts
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
```

and a Server Component in the member layout renders the dialog when
there's anything to show. Closing it calls a Server Action that records
the latest number. Small design choices make it pleasant:

- **New members start at the latest note** (the `defaultValue` in the
  Better Auth config), so they aren't shown a history of changes to an
  app they've never used.
- **A member who missed three releases sees all three**, merged into one
  popup.
- **Notes are filtered by audience**, so pilots aren't told about
  officer tools.
- **They're still readable later**, from "What's new" in the account
  menu.

Because the notes are in the repository, writing them is part of the
release checklist, reviewed like code.

## Keeping It Understandable

The person maintaining this app in three years may be you, having
forgotten everything. A few habits make that bearable.

**Comments say why.** Throughout this book you've seen comments like:

```ts
// Upload first, then record the squawk: a failed upload then leaves
// nothing behind but an unreferenced object, never a squawk whose
// photos are missing.
```

The code says _what_ happens. Only the comment explains why the order
matters. Comments that restate the code ("increment i") are noise;
comments that capture a decision, a constraint, or a trap are gold.

**Commit messages say why, too.** The diff shows what changed. The
commit message is the only place the _reason_ survives. A good message
has a short imperative subject ("maintenance: name items for their kind
unless general") and a body explaining the problem and the approach.
Months later, `git blame` on a puzzling line leads to the commit, and
the commit explains it.

**Documentation at three levels.** Flight Club has:

- `docs/spec.md`: what the app does and why, in the club's terms.
- `README.md`: how it's built and how to run it.
- `docs/deploy.md`: how to set up, deploy, back up and restore.

Each is short enough to read in one sitting. Update them in the same
commit as the change that makes them wrong.

**Keep dependencies current.** Security fixes arrive as updates. Update
regularly, in small steps, with the test suite as your safety net.
Tools like Dependabot or Renovate open pull requests for updates
automatically, and CI tells you whether they're safe. A project left
untouched for two years faces one huge, risky upgrade instead of many
trivial ones.

**Delete code.** Features nobody uses still need maintaining. Remove
them, along with their tables (expand and contract, in reverse).

## Where to Go from Here

You now understand every layer of a production web application. Some
directions to grow, each a natural next feature for Flight Club:

- **Email.** Password reset, "your medical expires next month"
  reminders, and squawk notifications to plane captains. You'll need an
  email provider (Postmark, Resend, SES) and to think about
  deliverability.
- **Background jobs.** Reminders shouldn't be sent during a web
  request. A scheduled job (Render cron jobs, or a queue) runs them on
  its own schedule.
- **Reservations.** Booking aircraft in advance, with PostgreSQL
  exclusion constraints preventing overlaps (Chapter 4's exercise).
- **Observability.** Error tracking (Sentry), structured logs, and
  uptime monitoring tell you about problems before members do.
- **Offline support.** The app already has a web manifest
  (`src/app/manifest.ts`) so members can add it to their home screen. A
  service worker could queue a squawk report taken with no signal and
  send it when the phone reconnects.
- **Rate limiting and multi-factor authentication**, if the app ever
  serves a larger, less trusted audience.

Whatever you build next, the principles carry over:

- The server enforces every rule; the browser only helps.
- Store facts, derive conclusions, and let the database refuse nonsense.
- Keep the important logic in plain, tested functions.
- Lock what you decide on, and write audit records in the same
  transaction.
- Build once, configure at runtime, and promote the same artifact.
- Change the schema in steps that the running code can tolerate.
- Write down _why_.

Good luck, and fly safe.

## Summary

- Migrations run before new code takes traffic, and rollbacks leave the
  new schema in place, so every migration must work with the code
  that's live. Expand first, contract in a later release.
- Point-in-time recovery fixes human error; your own dumps cover longer
  horizons. Practice restoring.
- Release notes in code, tracked per member, tell people what changed in
  their own terms.
- Comments, commit messages and short documents should capture _why_.
  Keep dependencies current and delete what isn't used.

## Exercises

1. Plan, as a pair of migrations and code changes, renaming
   `squawk.description` to `squawk.summary` without downtime.
2. Restore staging to a point an hour ago (if you have access), or
   restore a local `pg_dump` into a fresh local database. Time it.
3. Write a release note for a feature you'd add, and decide who it's
   for.

**Back to:** [Contents](README.md) · **Appendix:** [A. Glossary](appendix-a-glossary.md)

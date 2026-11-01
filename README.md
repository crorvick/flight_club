# Flight Club

A web app for a small flight club: flight logging, squawks and
maintenance, and pilot qualifications. `docs/spec.md` says what it does
and why; this file says how it works and how to run it, and
`docs/deploy.md` covers staging, production and backups in detail.

## Stack

Next.js (App Router) and TypeScript, Postgres through Drizzle ORM, Zod
for validation, Better Auth for accounts, Tailwind CSS and shadcn/ui,
Vitest and Playwright for tests. It ships as a Docker image to Render,
with squawk photos in an S3-compatible bucket (Cloudflare R2).

## Local development

Requires Node 24 or later (see `.nvmrc`), pnpm (`corepack enable`), and
Docker.

```sh
pnpm install
cp .env.example .env
pnpm db:up          # Postgres 18 and photo storage in Docker Compose
pnpm db:migrate
pnpm storage:init   # create the photo bucket
pnpm db:seed        # sample members, aircraft, flights, squawks, maintenance
pnpm dev            # http://localhost:3000
```

To get past "waiting for approval", sign up in the app and then approve
yourself: `pnpm member:approve you@example.com officer pilot`. After
that, officers approve everyone else on the Members page.

When `.env.example` gains a variable (it lists every one the app reads),
copy the new lines into your `.env`.

## Common tasks

| Command               | What it does                                   |
| --------------------- | ---------------------------------------------- |
| `pnpm typecheck`      | Generate route types and run `tsc`             |
| `pnpm lint`           | ESLint                                         |
| `pnpm format`         | Prettier (`format:check` to only check)        |
| `pnpm test`           | Vitest unit tests (`test:watch` while working) |
| `pnpm test:e2e`       | Playwright at phone, tablet and desktop sizes  |
| `pnpm build`          | Production build                               |
| `pnpm start`          | Run the production build as the image does     |
| `pnpm db:generate`    | Write a migration from changes to the schema   |
| `pnpm db:migrate`     | Apply pending migrations                       |
| `pnpm db:seed`        | Fill an empty database with sample data        |
| `pnpm db:studio`      | Browse the database in Drizzle Studio          |
| `pnpm storage:init`   | Create the photo bucket if it's missing        |
| `pnpm member:approve` | Activate a member and set their roles          |

Database changes: edit `src/db/schema.ts`, run `pnpm db:generate`,
review the SQL it writes to `drizzle/`, then `pnpm db:migrate`. Commit
the schema change and the migration together. Check the SQL: reordering
a list that becomes a Postgres enum, for example, generates a migration
that drops and recreates the type.

`pnpm test:e2e` uses the dev server locally. With `CI=1` it runs
against the production build instead, so run `pnpm build` first. Each
test creates its own aircraft and members and removes them afterwards,
because the four device projects run in parallel on one database.

## How it works

### Where things are

```
src/
  app/                  Routes: each folder is a URL, page.tsx renders it
    (auth)/             Sign in and sign up
    (member)/           Everything behind sign-in, sharing one layout
      check-out/        Check an aircraft out before flying
      dispatches/       Check it back in (recording the flight) or cancel
      flights/          View, edit and correct flights
      squawks/          Report and resolve squawks; photos/ serves images
      fleet/            Every aircraft's status, squawks and what's due
      aircraft/         Officers: aircraft, meters, maintenance items
      maintenance/      Officers: one maintenance item and its history
      members/          Officers: approvals, roles, qualifications
      qualifications/   A pilot's own medical, flight review, currency
    api/                Better Auth's endpoints and the health check
  components/           UI shared between pages
  db/                   Table definitions, connection, audit log helper
  lib/                  Rules and data access; *.test.ts beside each rule
drizzle/                Migrations, applied in order on every deploy
scripts/                Plain Node scripts that also run in the image
e2e/                    Playwright tests
```

The rules that matter (meter readings, edit locks, maintenance due
dates, pilot currency, who may do what) live in `src/lib` as plain
functions with no database or React, so they're unit tested directly
and shared by the forms' live feedback and the server's enforcement.
Pages and actions do the database work and call them.

### Pages, forms and the server

Pages are React Server Components: they run on the server, query the
database and send HTML. Anything interactive (live durations, landing
steppers, photo thumbnails) is a Client Component, marked `"use
client"`. Forms submit to Server Actions (`actions.ts` files, marked
`"use server"`), which validate with Zod, write in a transaction, and
redirect to a page showing the result. On a failed submit they return
what was typed, so nothing is lost on a bad connection.

With Cache Components on, anything that reads the session or the URL
sits inside `<Suspense>`: the page's shell is prerendered and the
member's part streams in.

### Who can do what

Members sign up, then wait for an officer to activate them and give
them role tags (`pilot`, `officer`). Every page and action checks on
the server through `requireMember()` in `src/lib/session.ts`, which
uses `decideAccess()` in `src/lib/access.ts`. Hiding a button is never
the check. An inactive member can do nothing, whatever their tags.

Every officer change (resolving squawks, editing members, aircraft,
meters and maintenance, correcting flights) writes to the `audit_log`
table in the same transaction, with only the fields that changed.

### Checking out, checking in, and meters

Each aircraft has one or more meters (Hobbs, tach, air time) with a
current reading. Readings are handled as integer hundredths of an hour
(`src/lib/hours.ts`), never floats.

A flight starts with a check-out (a `dispatch` in the code, so it isn't
confused with a pilot's checkout in an aircraft, a qualification). The
pilot confirms each meter against the panel and acknowledges every
unresolved squawk. A grounded aircraft can't be checked out, and only
one pilot can have an aircraft out at a time (a unique index makes
sure). If a meter reads more than the app expects, someone flew without
logging it: the meter moves to what the panel reads and the gap is
listed for officers, on the home page, to account for and mark
reviewed.

A checked-out aircraft is either cancelled, which records nothing, or
checked in with the in readings and landings, which records the flight:
every meter's out and in, which meter it was billed by, and the meters
moved to the in readings. Checking in also locks the aircraft's
previous flight. A pilot can edit their own flight until then; after
that only an officer can correct it, with a reason that's audited.
Pilots can't delete flights.

Every write that touches an aircraft's meters locks their rows first,
in the same order, so two of them can't interleave or deadlock.

### Status is derived, never stored

Whether an aircraft is grounded, what maintenance is due, and whether a
pilot is current are computed whenever they're shown (`src/lib/fleet.ts`,
`src/lib/maintenance.ts`, `src/lib/qualifications.ts`), so they can't
disagree with the records they come from. An aircraft is grounded while
it has an open grounding squawk or an overdue maintenance item set to
ground it. Only an officer can resolve a grounding squawk, with a note.

Checking out shows pre-flight warnings for all of it: grounded, due
or overdue maintenance, an expired medical or flight review, no
checkout in the aircraft, and passenger currency. Only grounding
blocks checking out; the rest are warnings.

### Photos

Squawk photos are shrunk in the browser to about 1600px (which also
drops the camera's location data), uploaded through the server action,
and stored in a private bucket. They're served back through
`/squawks/photos/[id]` only to signed-in members. The bucket settings
are optional at startup, so the app runs without them; only photo
uploads fail.

## Deploying and promoting

Every merge to `master` builds one Docker image, tagged with the commit,
and deploys it to staging. Production gets the same image, never a
rebuild, when you promote it after checking staging (on a phone as well
as a desktop):

```sh
gh workflow run promote.yml -f sha=<commit>
```

Migrations run before each deploy switches traffic, so a failed
migration leaves the old version serving. Roll back by promoting an
earlier commit; migrations aren't reversed, so keep them backward
compatible. The one-time setup of Render, GitHub and the photo bucket,
and the environment variables, are in `docs/deploy.md`.

## Restoring a backup

Render backs up the databases continuously. To recover from a mistake,
restore to a point in time just before it: in Render, the database →
Recovery → Restore Database. That creates a new database; check it,
point the service's `DATABASE_URL` at it, update `render.yaml` to
match, and remove the old one. The full steps, and how to keep your own
longer-term dumps, are under "Backups" in `docs/deploy.md`. Try a
restore on staging once before there's real data to lose.

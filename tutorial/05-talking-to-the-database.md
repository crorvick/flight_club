# Chapter 5. Talking to the Database

We have a design. Now we need the app to create those tables, change
them as the app grows, and read and write rows safely while many people
use it at once. This chapter introduces Drizzle, a TypeScript library
for all three, and the techniques (transactions and row locks) that keep
concurrent writes from corrupting each other.

In this chapter you'll learn:

- What an ORM does, and why we chose a thin one
- How to define tables in TypeScript and generate SQL migrations
- How migrations are applied, locally and in production
- How to query, insert and update with Drizzle
- How transactions and row locks prevent race conditions
- How to seed a database with realistic sample data

## Why an ORM, and Why a Thin One

You could write SQL strings by hand and send them with a driver. Many
experienced developers do. The problem is that the results come back as
untyped objects, and nothing checks that the query matches the schema
until it runs.

An **ORM** (object-relational mapper) or **query builder** lets you
describe tables in your programming language and build queries from
those descriptions. Drizzle is deliberately close to SQL: its queries
read almost like the SQL they produce, and it doesn't hide what's
happening. What it adds is types. If you rename a column, every query
using the old name becomes a compile error.

> [!NOTE]
> **Alternatives.** Prisma is the most popular TypeScript ORM, with its
> own schema language and a more abstract query API. Kysely is a pure
> query builder, even closer to SQL. Python's SQLAlchemy and Ruby's
> ActiveRecord are the equivalents in those worlds. The concepts in this
> chapter (schema, migrations, transactions) apply to all of them.

## Defining the Schema

Tables are defined in `src/db/schema.ts`. Here's the `squawk` table:

```ts
// src/db/schema.ts (excerpt)
import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const id = () =>
  uuid("id")
    .default(sql`pg_catalog.gen_random_uuid()`)
    .primaryKey();
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const squawkStatus = pgEnum("squawk_status", [
  "open",
  "deferred",
  "resolved",
]);
export const grounding = pgEnum("grounding", GROUNDING_LEVELS);

export const squawk = pgTable(
  "squawk",
  {
    id: id(),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id),
    reportedById: uuid("reported_by_id")
      .notNull()
      .references(() => member.id),
    reportedAt: timestamptz("reported_at").defaultNow().notNull(),
    description: text("description").notNull(),
    grounding: grounding("grounding").default("none").notNull(),
    status: squawkStatus("status").default("open").notNull(),
    resolvedById: uuid("resolved_by_id").references(() => member.id),
    resolvedAt: timestamptz("resolved_at"),
    resolutionNote: text("resolution_note"),
  },
  (table) => [
    index("squawk_unresolved_idx")
      .on(table.aircraftId)
      .where(sql`${table.status} <> 'resolved'`),
    check("squawk_resolution_complete", sql`case when ...`),
  ],
);
```

Each property maps a TypeScript name (`aircraftId`) to a database column
(`aircraft_id`). The second argument to `pgTable` adds indexes and
constraints. Small helper functions (`id()`, `timestamptz()`) keep
repeated column definitions consistent.

Notice `GROUNDING_LEVELS`: the enum's values come from the same constant
the application uses (`src/lib/grounding.ts`). The database type and
the TypeScript type are derived from one list, so they can't drift
apart.

Relations, declared separately, tell Drizzle how tables connect so it
can fetch nested data for you:

```ts
export const squawkRelations = relations(squawk, ({ one, many }) => ({
  aircraft: one(aircraft, {
    fields: [squawk.aircraftId],
    references: [aircraft.id],
  }),
  reportedBy: one(member, {
    fields: [squawk.reportedById],
    references: [member.id],
    relationName: "squawk_reported_by",
  }),
  photos: many(squawkPhoto),
}));
```

## Migrations

The database's structure has to change as the app evolves: new tables,
new columns, new constraints. Doing this by hand on each environment is
error-prone. **Migrations** are numbered SQL files, committed with the
code, that each move the schema one step forward. Every environment
applies the same files in the same order, so they all end up identical.

The workflow:

1. Edit `src/db/schema.ts`.
2. Run `pnpm db:generate`. drizzle-kit compares the schema with a
   snapshot of the previous one and writes the difference as SQL in
   `drizzle/`.
3. **Read the SQL.** It's what will run against production.
4. Run `pnpm db:migrate` to apply it locally.
5. Commit the schema change and the migration together.

Here's the migration generated when plane captains were added:

```sql
-- drizzle/0012_plane_captains.sql
CREATE TABLE "aircraft_captain" (
	"aircraft_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aircraft_captain_aircraft_id_member_id_pk" PRIMARY KEY("aircraft_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "aircraft_captain" ADD CONSTRAINT "aircraft_captain_aircraft_id_aircraft_id_fk"
  FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX "aircraft_captain_member_idx" ON "aircraft_captain" USING btree ("member_id");
```

The configuration that tells drizzle-kit where things are is small:

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
});
```

> [!WARNING]
> Generated migrations are a draft, not gospel. drizzle-kit can't know
> your intent. Renaming a column may come out as "drop column, add
> column," which deletes the data. Reordering an enum's values may come
> out as dropping and recreating the type. Always read the SQL, and edit
> it when it's wrong. Migrations can also contain hand-written data
> changes (`UPDATE … SET …`), which is how you backfill a new column.

### Applying Migrations

Applying migrations is a small script that runs in production too, so
it uses only plain Node and two packages:

```ts
// scripts/migrate.mts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");
} finally {
  await client.end();
}
```

The migrator records which migrations it has applied in a table of its
own (`drizzle.__drizzle_migrations`) and runs only the new ones. It runs
all pending migrations in **a single transaction**, so either every one
of them applies or none does. A failure halfway can't leave the schema
half-changed.

> [!NOTE]
> **Under the Hood: one transaction has consequences.** Most of the time
> running everything in one transaction is purely a benefit. But
> PostgreSQL has a few operations whose effects aren't usable until they
> commit. The notable one is `ALTER TYPE … ADD VALUE`: a new enum value
> can't be used by later statements in the same transaction. If one
> migration adds a value and the next uses it, a fresh database (which
> applies both at once) fails while yours (which applied them on separate
> days) worked. Flight Club's `drizzle/0015_annual_kind.sql` works around
> this by renaming the old type, creating a new one with the extra value,
> and converting the column. Test migrations against a database that's
> several migrations behind, not only your own.

## Connecting

The application connects through `src/db/index.ts`:

```ts
// src/db/index.ts
import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

function connect() {
  const client = postgres(serverEnv().DATABASE_URL);
  return drizzle(client, { schema });
}

// Reuse one connection pool across hot reloads in development; otherwise
// every edit would open a new pool and eventually exhaust connections.
const globalForDb = globalThis as unknown as {
  db?: ReturnType<typeof connect>;
};

export function db() {
  globalForDb.db ??= connect();
  return globalForDb.db;
}
```

Three details are worth understanding:

- `postgres(url)` creates a **connection pool**: a handful of open
  connections shared by all requests. Opening a database connection is
  slow (a network round trip, authentication, process startup on the
  server), so you never open one per request.
- The pool is created on first use, inside `db()`, not when the module
  is imported. `next build` imports every module, and at build time
  there's no database to connect to. Chapter 13 explains why the build
  must not need one.
- It's stored on `globalThis` so the dev server's hot reloading, which
  re-imports modules on every save, keeps reusing one pool instead of
  leaking a new one each time.

## Querying

Drizzle has two styles of query. The **SQL-like builder** maps almost
one to one onto SQL:

```ts
import { and, asc, eq, ne } from "drizzle-orm";

const open = await db()
  .select({
    id: squawk.id,
    description: squawk.description,
    grounding: squawk.grounding,
  })
  .from(squawk)
  .where(
    and(
      eq(squawk.aircraftId, aircraftId),
      eq(squawk.status, "open"),
      ne(squawk.grounding, "none"),
    ),
  )
  .orderBy(asc(squawk.reportedAt));
// open: { id: string; description: string; grounding: "none" | "ifr" | "all" }[]
```

The result is fully typed, inferred from the schema and the columns you
selected. Joins look like SQL joins:

```ts
const flights = await db()
  .select({
    date: flight.date,
    tailNumber: aircraft.tailNumber,
    pilot: member.name,
  })
  .from(flight)
  .innerJoin(aircraft, eq(aircraft.id, flight.aircraftId))
  .innerJoin(member, eq(member.id, flight.pilotId))
  .where(and(gte(flight.date, from), lte(flight.date, to)));
```

The **relational query API** fetches nested data using the relations
declared earlier:

```ts
const plane = await db().query.aircraft.findFirst({
  where: and(eq(aircraft.id, aircraftId), eq(aircraft.active, true)),
  with: { meters: true },
});
// plane: { id, tailNumber, ..., meters: { id, kind, label, currentReading }[] } | undefined
```

Use whichever reads more clearly. Flight Club uses the builder for
reports and anything with aggregates, and the relational API for
"load this record and its children" pages.

Inserts and updates:

```ts
const [created] = await db()
  .insert(squawk)
  .values({ aircraftId, reportedById: member.id, description, grounding })
  .returning({ id: squawk.id });

await db()
  .update(meter)
  .set({ currentReading: "1235.40" })
  .where(eq(meter.id, meterId));
```

> [!IMPORTANT]
> Every value you pass (`aircraftId`, `description`) is sent as a
> **bound parameter**, separate from the SQL text, never pasted into it.
> That's what prevents **SQL injection**, where a malicious input like
> `'; DROP TABLE flight; --` is interpreted as SQL. When you need raw SQL,
> use Drizzle's `` sql`…` `` template tag, which parameterizes
> interpolated values the same way. Never build SQL with string
> concatenation.

> [!NOTE]
> Drizzle returns `numeric` columns as **strings**, like `"1234.50"`, not
> numbers. That's deliberate: converting to a JavaScript number would
> reintroduce floating-point error. Chapter 8 shows how to do arithmetic
> on them exactly.

## Transactions

Checking a flight in does several things: insert the flight, insert a
reading for each meter, move each meter to its new reading, lock the
previous flight. If the server crashes after the second step, we'd have
a flight whose meters were never moved, and the next pilot's check-out
would show the wrong numbers.

A **transaction** groups statements so they succeed or fail as one
(the "A," atomicity, in ACID). In Drizzle:

```ts
await db().transaction(async (tx) => {
  const [created] = await tx.insert(flight).values({ ... }).returning({ id: flight.id });
  await tx.insert(flightMeterReading).values(readings.map((r) => ({ flightId: created.id, ... })));
  for (const r of readings) {
    await tx.update(meter).set({ currentReading: r.in }).where(eq(meter.id, r.meterId));
  }
});
```

Inside the callback, use `tx`, not `db()`. If the callback throws, every
statement is rolled back. If it returns, they're committed together.

## Concurrency and Row Locks

Transactions make a group of writes atomic, but they don't on their own
stop two requests from interleaving. Consider two officers correcting
the same flight at once:

1. Officer A reads the meters: Hobbs reads 1234.5.
2. Officer B reads the meters: Hobbs reads 1234.5.
3. A writes a correction based on 1234.5 and commits.
4. B writes a correction based on 1234.5 (now stale) and commits,
   silently undoing A's work.

This is a **lost update**. The fix is to lock the rows you're about to
base a decision on, with `SELECT … FOR UPDATE`:

```ts
// src/app/(member)/dispatches/actions.ts (excerpt)
dispatchId = await db().transaction(async (tx) => {
  // Locked so a check-in or correction can't move them underneath us.
  const current = await tx
    .select({ id: meter.id, reading: meter.currentReading })
    .from(meter)
    .where(eq(meter.aircraftId, aircraftId))
    .for("update");

  // Did the meters change since the pilot loaded the page?
  if (current.some((m) => parseHours(m.reading) !== expected.get(m.id))) {
    throw new Rejected(
      "This aircraft changed since the page loaded. Review it and check out again.",
    );
  }
  // ... insert the dispatch, its readings, its squawk acknowledgements ...
});
```

A second transaction asking for the same rows `FOR UPDATE` waits until
the first commits, then sees the new values. Combined with the check
("do the meters still read what the pilot saw?"), this turns a silent
lost update into a clear message asking the user to review and retry.
That pattern, **lock, re-check, then write**, appears in every Flight
Club action that changes meters or squawks.

> [!WARNING]
> If transaction 1 locks row A then row B, while transaction 2 locks B
> then A, each waits for the other forever: a **deadlock**. PostgreSQL
> detects this and aborts one of them, but it's still a failure. Always
> lock rows in a consistent order. Flight Club locks an aircraft's meters
> first, before any other row, in every write that touches them.

### Turning Constraint Violations into Messages

Recall the partial unique index from Chapter 4 that allows only one
check-out per aircraft. When it fires, PostgreSQL reports error code
`23505` (unique violation) with the constraint's name. The action
recognizes that and responds in the user's terms:

```ts
} catch (error) {
  if (error instanceof Rejected) return { error: error.message, values };
  const constraint = constraintOf(error); // reads error.cause.code / constraint_name
  if (constraint === "dispatch_one_out_per_aircraft") {
    return { error: `Someone else just checked out ${plane.tailNumber}.`, values };
  }
  if (constraint === "dispatch_one_out_per_pilot") {
    return { error: "You already have an aircraft checked out.", values };
  }
  throw error;
}
```

Anything unrecognized is re-thrown. Never swallow an error you don't
understand.

## Seed Data

An empty database is useless for development. `scripts/seed.mts`
creates sample members, aircraft with realistic meters, months of
flights, open and resolved squawks, and maintenance items in various
states of due:

```sh
pnpm db:seed
```

Two properties make it safe and useful:

- **It refuses to run if any aircraft exist**, so it can't be pointed at
  production by mistake.
- **It's deterministic.** It uses a seeded pseudo-random generator, so
  every developer's database (and staging's) looks the same, and a bug
  report like "the third Cessna shows the wrong due date" means
  something.

CI runs the seed script on every change too, which keeps it working as
the schema evolves.

> [!TIP]
> `pnpm db:studio` opens Drizzle Studio, a browser-based table viewer for
> your local database. It's handy for checking what an action actually
> wrote.

## Summary

- Drizzle defines tables in TypeScript and generates typed queries;
  drizzle-kit turns schema changes into SQL migration files.
- Always read generated migrations. Apply them with a small script that
  runs in every environment, all pending ones in one transaction.
- Use one connection pool per process, created lazily.
- Values are always bound parameters; never build SQL by concatenation.
- Transactions make groups of writes atomic. `SELECT … FOR UPDATE` locks
  rows so concurrent requests can't lose each other's updates. Lock in a
  consistent order.
- Let constraints catch races, and translate their errors into helpful
  messages.

## Exercises

1. Add a nullable `notes` column to `aircraft` in `schema.ts`, run
   `pnpm db:generate`, and read the SQL. Then delete the migration and
   revert the change (or keep it, if you like).
2. Open two `psql` sessions. In the first, run `BEGIN; SELECT * FROM
meter LIMIT 1 FOR UPDATE;`. In the second, try to update that row.
   What happens? Now `COMMIT` the first.
3. Find `recordFlight` in `src/app/(member)/flights/record.ts`. What
   does its comment require of the caller, and why?

**Next:** [Chapter 6. Forms and Server Actions](06-forms-and-server-actions.md)

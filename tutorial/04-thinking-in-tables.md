# Chapter 4. Thinking in Tables

A web server's memory is wiped every time it restarts, and in
production it restarts often: on every deploy, every crash, every time
the host moves it to another machine. Anything worth keeping has to
live somewhere else. This chapter surveys where data can live, then
focuses on the most important option, a relational database, and on
the most important skill in using one: designing tables that refuse to
hold nonsense.

In this chapter you'll learn:

- The main kinds of persistent storage, and what each is for
- Relational fundamentals: tables, keys, relationships, and joins
- How to choose column types, especially for money-like quantities and
  time
- How constraints make the database enforce your rules
- Why some state should be derived rather than stored
- How to run PostgreSQL locally in Docker

## Where Data Can Live

| Kind                        | Examples                               | Good for                                                                                           | Flight Club uses it for                                                    |
| --------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Relational database**     | PostgreSQL, MySQL, SQLite              | Structured records with relationships and rules; anything you query, join, or must keep consistent | Members, aircraft, flights, squawks, maintenance, sessions, audit log      |
| **Object storage**          | Amazon S3, Cloudflare R2, Backblaze B2 | Large files (images, PDFs, video, backups), cheaply and durably                                    | Squawk photos (Chapter 10)                                                 |
| **Key-value store / cache** | Redis, Valkey, Memcached               | Fast, often temporary data: caches, rate limits, job queues                                        | Nothing yet; a small club doesn't need it                                  |
| **Document database**       | MongoDB, DynamoDB, Firestore           | Data that's naturally nested and rarely joined; very large scale                                   | Nothing; Postgres's `jsonb` covers the occasional document                 |
| **Browser storage**         | Cookies, `localStorage`, IndexedDB     | Per-device preferences and small client state                                                      | The session cookie (Chapter 7) and the light/dark theme choice (Chapter 9) |
| **Local disk**              | The server's filesystem                | Temporary files only                                                                               | Nothing; it's wiped on deploy (Chapter 10)                                 |

For most applications, the right default is: **a relational database for
records, object storage for files**, and nothing else until you have a
measured reason. Every additional storage system is something else to
configure, back up, secure, and keep consistent with the others.

> [!NOTE]
> **Alternatives: SQLite.** SQLite is a relational database in a single
> file, embedded in your process. It's superb for desktop apps, tests,
> and single-server sites, and tools like Litestream can replicate it.
> We use PostgreSQL because our host provides it fully managed, with
> automatic backups and point-in-time recovery (Chapter 15), and because
> it runs as a separate service that several app instances can share.

## Relational Basics

A relational database stores data in **tables**. Each table has a fixed
set of **columns**, each with a type, and holds any number of **rows**.
Here's a simplified `aircraft` table:

| id    | tail_number | make_model      | active |
| ----- | ----------- | --------------- | ------ |
| 7c1e… | N4521K      | Cessna 172S     | true   |
| a90b… | N733JB      | Piper PA-28-181 | true   |

You talk to it in **SQL**:

```sql
SELECT tail_number, make_model
FROM aircraft
WHERE active
ORDER BY tail_number;
```

SQL is _declarative_: you describe the result you want and the
database works out how to produce it. It's worth learning properly;
even when an ORM writes your queries (Chapter 5), you'll read SQL in
migrations, in logs, and when debugging.

### Primary Keys

Every table needs a **primary key**: a column (or set of columns) that
uniquely identifies each row. Flight Club uses random UUIDs:

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
```

The alternative is an auto-incrementing integer (`1, 2, 3…`). UUIDs have
two advantages for a web app: they don't reveal how many records exist
(a squawk at `/squawks/1043` tells a visitor something; `/squawks/3f2c…`
doesn't), and they can be generated _before_ inserting, which we'll use
in Chapter 10 to name photo files after a squawk that doesn't exist yet.

### Relationships and Foreign Keys

Each aircraft has several **meters** (tach, Hobbs, air time). That's a
_one-to-many_ relationship, modeled by giving each meter a column that
refers to its aircraft:

```sql
CREATE TABLE meter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id uuid NOT NULL REFERENCES aircraft (id),
  kind meter_kind NOT NULL,
  label text NOT NULL,
  current_reading numeric(9, 2) NOT NULL
);
```

`REFERENCES aircraft (id)` makes `aircraft_id` a **foreign key**. The
database will refuse to insert a meter for an aircraft that doesn't
exist, and refuse to delete an aircraft that still has meters. That
second rule is exactly what we want: deleting an aircraft with a
flight history would destroy the records the club relies on. Officers
deactivate aircraft instead.

Sometimes deleting the parent _should_ take the children with it. A
flight's meter readings mean nothing without the flight, so:

```sql
flight_id uuid NOT NULL REFERENCES flight (id) ON DELETE CASCADE
```

A _many-to-many_ relationship needs a table of its own. A member can be
"plane captain" of several aircraft, and an aircraft can have several
captains:

```sql
CREATE TABLE aircraft_captain (
  aircraft_id uuid NOT NULL REFERENCES aircraft (id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES member (id) ON DELETE CASCADE,
  PRIMARY KEY (aircraft_id, member_id)
);
```

The composite primary key means the same member can't be captain of
the same aircraft twice.

### Joins

To combine related rows, **join** the tables:

```sql
SELECT f.date, a.tail_number, m.name AS pilot, f.billed_hours
FROM flight f
JOIN aircraft a ON a.id = f.aircraft_id
JOIN member m   ON m.id = f.pilot_id
WHERE f.date >= '2026-10-01'
ORDER BY f.date;
```

That's the core of the flights report officers print each month.

## The Flight Club Model

Here are the main tables and how they relate. (The full definitions are
in `src/db/schema.ts`, which Chapter 5 explains.)

```mermaid
erDiagram
    member ||--o{ flight : flies
    member ||--o{ squawk : reports
    member ||--o{ aircraft_captain : "is captain"
    aircraft ||--o{ aircraft_captain : "has captains"
    aircraft ||--|{ meter : has
    aircraft ||--o{ flight : "is flown on"
    aircraft ||--o{ squawk : "has problems"
    aircraft ||--o{ maintenance_item : "needs"
    aircraft ||--o{ dispatch : "is checked out"
    flight ||--|{ flight_meter_reading : records
    meter ||--o{ flight_meter_reading : "is read"
    squawk ||--o{ squawk_photo : "has"
    maintenance_item ||--o{ maintenance_completion : "was done"
    dispatch |o--o| flight : "becomes"
```

A few design decisions are worth calling out, because each one is a
general lesson.

**Meters are rows, not columns.** It would be simpler to give
`aircraft` a `tach` column and a `hobbs` column. But some aircraft have
only a tach and one has an air-time meter as well. Rows handle any
combination without schema changes or a column full of nulls. When a
thing can appear a variable number of times, it's a table.

**Flights snapshot what they were billed by.** Each flight stores
`billing_meter_kind` and `billed_hours` rather than looking them up from
the aircraft. If an officer later changes an aircraft from Hobbs billing
to tach billing, past flights must not be re-billed. When a fact is
about a moment in time, copy it into the record of that moment.

**A check-out is its own table.** A pilot checks an aircraft out
(a `dispatch` row) before flying, then checks it in, which creates the
`flight`. Modeling the in-progress state explicitly lets the database
enforce that an aircraft is out with only one pilot at a time, as we'll
see below.

## Choosing Types

Getting column types right prevents whole categories of bugs.

### Never Use Floating Point for Exact Quantities

Meter readings are hours to two decimal places: `1234.56`. It's tempting
to store them as `double precision` and use JavaScript numbers. Don't.
Floating point can't represent most decimal fractions exactly:

```js
> 0.1 + 0.2
0.30000000000000004
```

That's harmless in a physics simulation and unacceptable in a bill. Use
`numeric(precision, scale)`, which stores exact decimals:

```sql
current_reading numeric(9, 2)   -- up to 9999999.99
```

The same applies to money: store cents in an integer, or use `numeric`.
Chapter 8 shows how the application side does its arithmetic in integer
hundredths to keep the exactness all the way through.

### Dates Versus Timestamps

PostgreSQL distinguishes:

- `date`: a calendar day, with no time or zone. A flight happened _on_
  2026-10-14; a medical expires _on_ 2027-03-31.
- `timestamp with time zone` (`timestamptz`): an exact instant. A squawk
  was reported _at_ 2026-10-14 15:42:07 UTC.

Use `date` for things people think of as days and `timestamptz` for
events. Avoid plain `timestamp` (without time zone): it records a wall
clock reading without saying which wall, which is ambiguous the moment
your server and users are in different zones.

### Enums for Fixed Choices

When a column can hold only a few values, an **enum** type makes the
database reject anything else:

```sql
CREATE TYPE squawk_status AS ENUM ('open', 'deferred', 'resolved');
```

The catch is that enums are awkward to change; Chapter 15 shows what
it takes to add a value safely.

### `jsonb` for the Occasional Document

Some data is genuinely shaped differently per row. Logging an oil change
records quarts per engine and the oil brand; logging a VOR check records
the bearing errors and where it was checked. Rather than a table per
kind, `maintenance_completion` has a `details jsonb` column holding a
small JSON document whose shape depends on the item's kind. PostgreSQL
can index and query inside `jsonb`:

```sql
SELECT * FROM maintenance_completion WHERE details->>'kind' = 'oil_change';
```

Use `jsonb` sparingly, for data you mostly read back whole. If you find
yourself joining on its contents or needing constraints inside it, it
wants to be columns.

## Constraints: Let the Database Say No

The application will validate every input (Chapter 6). So why also
make the database check things? Because the application isn't the only
thing that writes to it. There will be bugs. There will be scripts, and
someday someone will fix a row by hand in a SQL console. Constraints are
the last line of defense, and they're enforced regardless of who's
writing.

PostgreSQL offers several kinds:

```sql
-- Required.
tail_number text NOT NULL,

-- No duplicates.
tail_number text NOT NULL UNIQUE,

-- Arbitrary rules about a row.
CONSTRAINT flight_billed_hours_positive CHECK (billed_hours > 0),
CONSTRAINT flight_meter_reading_in_after_out CHECK ("in" > "out"),
```

`CHECK` constraints can express surprisingly rich rules. A resolved
squawk must record who resolved it, when, and why; an unresolved one
must have none of those:

```sql
CONSTRAINT squawk_resolution_complete CHECK (
  CASE WHEN status = 'resolved'
    THEN resolved_by_id IS NOT NULL AND resolved_at IS NOT NULL
         AND resolution_note IS NOT NULL
    ELSE resolved_by_id IS NULL AND resolved_at IS NULL
         AND resolution_note IS NULL
  END
)
```

### Partial Unique Indexes

Here's the constraint that stops two pilots taking the same aircraft at
once. A pilot can have many past dispatches for an aircraft, but only
one _currently out_. A **partial unique index** applies uniqueness only
to rows matching a condition:

```sql
CREATE UNIQUE INDEX dispatch_one_out_per_aircraft
  ON dispatch (aircraft_id) WHERE status = 'out';
```

If two pilots tap "Check out" at the same instant, both requests may
pass every check in the application, but only one `INSERT` can succeed.
The other gets a unique-violation error, which the app turns into a
friendly message (Chapter 5). No amount of application code can close a
race like this as reliably.

### Composite Foreign Keys

An aircraft's billing meter must be _one of that aircraft's own_
meters. A plain foreign key to `meter(id)` would accept any meter in the
fleet. Pairing the meter with the aircraft closes the gap:

```sql
ALTER TABLE aircraft ADD CONSTRAINT aircraft_billing_meter_fk
  FOREIGN KEY (billing_meter_id, id) REFERENCES meter (id, aircraft_id);
```

This requires a unique constraint on `meter (id, aircraft_id)` to point
at, which is cheap since `id` alone is already unique.

> [!TIP]
> Whenever you write a comment like "this must always be…", ask whether
> it can be a constraint instead. A comment documents a rule; a
> constraint enforces it.

## Derived, Not Stored

Is an aircraft airworthy? It's tempting to add a `status` column to
`aircraft` and update it whenever a squawk is reported or resolved. But
then there are two sources of truth (the squawks, and the status
column) and every code path that touches squawks must remember to keep
them in step. Sooner or later one won't, and the app will say an
aircraft is airworthy while an open squawk says it's grounded.

Instead, **compute status from the records whenever it's shown**: an
aircraft is grounded if any open squawk or overdue maintenance item
grounds it. The same goes for "when is the annual next due" (from the
last completion) and "is this pilot's medical current" (from its expiry
date). Chapter 8 writes these as pure functions.

Store facts; derive conclusions. Cache a conclusion only when you've
measured that computing it is too slow, and even then, treat the cache
as disposable.

## Indexes

Without help, finding rows means scanning the whole table. An **index**
is a sorted lookup structure that makes queries on particular columns
fast:

```sql
CREATE INDEX flight_aircraft_date_idx ON flight (aircraft_id, date);
```

This one serves "flights on this aircraft, by date," which the aircraft
flights page and the reports run constantly. Primary keys and unique
constraints get indexes automatically; foreign key columns don't, and
usually should have one. Indexes cost a little on every write and some
disk, so add them for queries you actually run.

A partial index can be small and targeted. Status checks look only at
unresolved squawks, so:

```sql
CREATE INDEX squawk_unresolved_idx ON squawk (aircraft_id)
  WHERE status <> 'resolved';
```

## Running PostgreSQL Locally

We run PostgreSQL in Docker, configured by `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: flightclub
      POSTGRES_PASSWORD: flightclub
      POSTGRES_DB: flightclub
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U flightclub"]
      interval: 2s
      timeout: 5s
      retries: 15

volumes:
  pgdata:
```

- `image` names a published PostgreSQL image, pinned to a major version
  so it matches production.
- `ports` exposes the container's port 5432 on your machine, so
  `localhost:5432` reaches it.
- The **named volume** `pgdata` stores the data outside the container,
  so it survives the container being removed and recreated.
- The `healthcheck` lets `docker compose up --wait` return only once the
  database is ready to accept connections.

Start it, and connect with `psql`:

```sh
pnpm db:up      # docker compose up -d --wait
docker compose exec db psql -U flightclub
```

```text
flightclub=# \dt          -- list tables
flightclub=# \d flight    -- describe one
flightclub=# select count(*) from flight;
```

The connection string the app uses, from `.env`, encodes the same
details: `postgres://flightclub:flightclub@localhost:5432/flightclub`
(user, password, host, port, database).

## Summary

- Use a relational database for records and object storage for files.
  Add other storage systems only when you've measured a need.
- Tables have primary keys; relationships are foreign keys. A
  many-to-many relationship gets its own table.
- Use `numeric` (or integers) for exact quantities, `date` for days,
  `timestamptz` for instants, enums for fixed choices, and `jsonb`
  sparingly.
- Constraints (`NOT NULL`, `UNIQUE`, `CHECK`, foreign keys, partial
  unique indexes) make the database enforce rules no matter who writes.
- Store facts and derive conclusions, so they can never disagree.
- Index the columns your queries filter and join on.

## Exercises

1. In `psql`, try to insert a flight whose `billed_hours` is `0`. Read
   the error. Which constraint stopped it?
2. Sketch tables for a feature the app doesn't have: aircraft
   reservations, with a start and end time. What constraint would
   prevent two overlapping reservations of the same aircraft? (Look up
   PostgreSQL's `EXCLUDE` constraints.)
3. Write a SQL query listing each aircraft's tail number with its
   number of open squawks, including aircraft with none. (Hint: `LEFT
JOIN` and `GROUP BY`.)

**Next:** [Chapter 5. Talking to the Database](05-talking-to-the-database.md)

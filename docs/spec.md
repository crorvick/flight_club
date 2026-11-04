# Flight Club Web App — Project Spec

A website for a small flight club to **record flights**, **track maintenance and squawks**, and **track pilot qualifications**. Built by an experienced programmer who is new to web development and wants to learn modern JavaScript/TypeScript best practices along the way.

---

## 1. Goals

- Phone-first task pages for the two most common actions: **logging a flight** and **reporting a squawk**.
- A single source of truth for aircraft status, maintenance due items, and pilot qualifications, with cross-checks between them (e.g., warn when flying a grounded or overdue aircraft).
- A git-driven deployment pipeline: push → automated tests → **staging** → explicit promotion → **production**.
- Code that is easy for a single part-time maintainer to understand and keep running for years.

---

## 2. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Language | **TypeScript** (strict mode) | Owner knows Python well; learning JS/TS is a goal. |
| Framework | **Next.js (App Router)** | Full-stack React. Use **server actions** for form submissions. Expect a learning curve around server vs. client components and caching. (SvelteKit is the fallback if Next.js proves too magical.) |
| Database | **PostgreSQL** | Separate databases for dev, staging, production. |
| ORM / migrations | **Drizzle ORM** + drizzle-kit | SQL-like; migration files are committed to git. |
| Validation | **Zod** | One schema per form → both runtime validation and TS types. |
| Auth | **Better Auth** | Email/password sessions; long-lived sessions so members rarely re-login on the ramp. |
| UI | **Tailwind CSS** + **shadcn/ui** | Mobile-first utility classes; accessible components. |
| Unit tests | **Vitest** | Qualification expiry, due-date math, meter logic. |
| E2E tests | **Playwright** | Run at phone and tablet viewports as well as desktop. |
| Packaging | **Docker** | One image per commit. |
| CI/CD | **GitHub Actions** | See §3. |
| Hosting | **Render** (default) | Managed Postgres with automated backups. Fly.io / Railway are alternatives. |

---

## 3. Environments & deployment pipeline

**Principle: build once, promote the same artifact.** Production runs the exact image that was tested on staging.

1. **Pull request** → GitHub Actions runs: typecheck, lint, Vitest, Playwright (against a throwaway Postgres service container).
2. **Merge to `master`** → build Docker image, push to a registry (e.g., GHCR) tagged with the commit SHA → deploy to **staging** automatically. Database migrations run as a pre-deploy step.
3. **Promote to production** → a manually triggered workflow (or a GitHub Environment with a required approval) deploys the *same SHA* to production. Migrations run as a pre-deploy step.

Environment rules:
- Each environment has its own database and its own secrets (stored in the host / GitHub Environments, never in git).
- Staging gets seed/fake data, not copies of production member data.
- Automated daily backups on the production database from day one; test a restore once.
- Migrations should be backward-compatible where practical (add columns before removing old ones) so a deploy can be rolled back.
- Local dev: Postgres via Docker Compose, a seed script with sample aircraft/pilots/flights.

---

## 4. Users & roles

- A **Member** can hold multiple **role tags**: `pilot`, `officer` (future: `instructor`, `mechanic`).
- A **plane captain** looks after particular aircraft: officers assign any active member as captain of one or more aircraft, and a captain manages those aircraft's maintenance items and squawks as an officer would. Nothing else an officer can do (members, aircraft settings, meters, flights) comes with it.
- All permission checks are enforced **on the server**, not just by hiding buttons in the UI.
- Every member logs in with their own account.

---

## 5. Data model (v1)

### Member
- id, name, email, phone (optional), role tags, active flag, auth fields (managed by Better Auth)
- Members change their own name, email and phone in Settings; changing the email, which is also the sign-in, takes their password. Every active member can see every other's email and phone in the member directory, and the phone of whoever has an aircraft out.
- A member's picture is their Gravatar, looked up by email, shown on their account menu, in the directory and in Settings; without one, their initials. The browser fetches it from Gravatar directly, so Gravatar sees a hash of each address shown, as it would on any site using it.

### Aircraft
- id, tail number, make/model, active flag, number of engines (single or twin; a twin's oil is recorded per engine, left and right), fuel totalizers (none, one, or on a twin one per engine)
- `billingMeterId` → references one of this aircraft's meters
- `logbookMeterId` → the meter that is its time in the maintenance logs (usually tach); hours intervals count on it
- Plane captains: the members assigned to look after it (an AircraftCaptain row per member)
- Status is **derived**: `grounded` if any open squawk or overdue maintenance item grounds it for all flying; otherwise `VFR only` if one grounds it for IFR; otherwise `airworthy`.

### Meter (configurable per aircraft)
Aircraft have different instruments, so meters are rows, not fixed columns.
- id, aircraftId, `kind`: `tach` | `hobbs` | `air_time`, display label, `currentReading` (decimal)

Meter definitions:
- **Tach**: engine time scaled by RPM. Most maintenance intervals use this.
- **Hobbs**: engine run time (engine/oil-pressure switch on).
- **Air time**: runs only while airborne (squat or airspeed switch). Deliberately *not* called "flight time", which has a regulatory pilot-logbook meaning.

Most aircraft have tach + Hobbs; one club aircraft has all three; some may have only tach.

### Flight
- id, aircraftId, pilotId, date, notes
- Fuel added (gallons) and oil added (quarts, per engine): the totals of what was added while it was checked out
- For aircraft with fuel totalizers, per totalizer: the fuel remaining it shows at the end of the flight (required), and the fuel it counted as used, across any resets (blank where it couldn't be counted)
- Landings aren't recorded (see PilotQualification).
- Snapshot at time of logging: `billingMeterKind`, `billedHours` (so changing an aircraft's billing meter later never re-bills past flights)
- createdAt, updatedAt, lockedAt (see rules)

### FlightMeterReading
- flightId, meterId, `out`, `in`
- One row per meter the aircraft has.

### Squawk
- id, aircraftId, reportedById, reportedAt, description, category (engine, avionics, airframe, other), `grounding`: `none` | `ifr` | `all` (for IFR only, or for all flying)
- status: `open` | `deferred` | `resolved`
- resolvedById, resolvedAt, resolutionNote
- Photos (stored in object storage; URLs on a SquawkPhoto table)

### MaintenanceItem
- id, aircraftId, name (annual, 100-hour, ELT, transponder, pitot-static, AD #…, etc.)
- A **schedule**, one of:
  - **Recurring**: due by **calendar time**, by **hours on the aircraft's logbook meter** (usually tach), or **whichever comes first**, counted from the last completion. Calendar time is either months **to the end of the month** (annual, ELT, transponder: done any day in March, 12 months makes it due 31 March next year) or an **exact period** in months or days (a VOR check within the preceding 30 days).
  - **Once**: due by a date, a logbook reading, or whichever comes first; logging it closes the item for good (a one-time AD).
  - **Expires**: due on an expiration date; logging a renewal asks for the new one (ELT battery, fire extinguisher, registration, insurance).
- Last completed date/reading, interval or due date/reading, computed next due
- A closed item (done once, or a recurring AD or SB ended by its terminating action) or an AD or SB that doesn't apply is never due again, and is listed apart from the open ones
- When overdue: grounds the aircraft, grounds it for IFR only, or only warns (chosen per item)
- A **kind**, which sets what logging a completion records besides the date, reading and note:
  - **General**: nothing more.
  - **Annual inspection**: as General; the mechanic's report counts from its last completion.
  - **VOR check** (14 CFR 91.171): how it was checked (VOT, ground checkpoint, airborne checkpoint, or dual VOR), where, and the bearing error of each receiver (or the difference between them on a dual check). A check outside the limit for its method (±4°, or ±6° airborne) is refused: it doesn't count. The member logging it is recorded, standing in for the signature.
  - **Oil change**: quarts put in each engine, the oil used (suggested from the aircraft's last oil change), whether the filter was replaced and an oil sample sent.
  - **100-hour inspection** (14 CFR 91.409(b)): always every 100 hours. It may be flown up to 10 hours over to reach a place where it can be done, but that time counts toward the next, so one done late counts from when it was due.
  - **Airworthiness directive** and **Service bulletin**: the item records the AD or bulletin number, what it applies to (airframe, engine, propeller, appliance), and whether it's done once or recurs; or that it doesn't apply to this aircraft, and why. Logging it records the method of compliance, and for a recurring one, whether it was the terminating action. New ADs ground the aircraft when overdue and new SBs only warn, as SBs are advisory under Part 91.
  - **Navigation database**: expires with its AIRAC cycle (every 28 days, starting from cycle 2001 on 2 January 2020). Logging an update records the cycle installed, suggesting the next one in the week before it takes effect, and the item is due when that cycle ends. New ones ground for IFR only when overdue.
- Each completion keeps its kind's details, so the item's history reads like the logbook entry.

### PilotQualification
- Medical (class, expiration), flight review (date → expiration), per-aircraft checkouts
- 90-day passenger currency is **not tracked**: landings aren't recorded, and staying current is each pilot's responsibility.

### AuditLog
- Who changed what, when, before/after. Required for officer edits to locked flights and for squawk resolution.

---

## 6. Business rules

**Meters & billing**
- Each aircraft's billing meter is a setting (any of its meters; typically Hobbs or tach).
- Every flight records **all** of the aircraft's meters, regardless of which one bills.
- Each aircraft's logbook meter is a setting too, independent of billing (billed by Hobbs, maintained by tach). Changing it moves hours-based maintenance items to the new meter, each keeping the hours it has left.
- Logging a flight updates each meter's `currentReading` to the flight's `in` value.

**Flight entry validation**
- `out` readings pre-fill from the aircraft's current readings.
- `in` must be greater than `out` for every meter (hard error).
- Unusually large values (e.g., > 10 hours) produce a "did you mean…?" warning, not a block.
- **Concurrency:** save the flight in a DB transaction that verifies each meter's `out` still equals the meter's `currentReading`. If not, reject with "This aircraft was just updated — please review" rather than corrupting totals.

**Fuel and oil**
- While an aircraft is checked out, its pilot (or an officer) adds fuel and oil as often as they put some in, each an entry on the check-out. A typo is removed and added again.
- On aircraft with totalizers, the pilot confirms what each shows at check-out (pre-filled from the last flight's end), and each fueling records what it showed before and what it was reset to. A totalizer only counts down between resets, so a reading higher than the last is refused.
- Checking in asks only for each totalizer's fuel remaining. The flight records the entries' totals, the final readings, and the fuel used: the drop from check-out or each reset to the next reading.

**Editing flights**
- A pilot may edit their own flight **until the next flight is logged on that aircraft**; then it locks.
- Officers can edit locked flights, and an aircraft's plane captains can edit its flights; every such edit writes to the AuditLog.
- Officers and the aircraft's plane captains can also add a past flight that wasn't logged at the time (from the paper log, say), with every reading entered and a note of where it came from (audited). One that starts at or after every meter's current reading, while the aircraft isn't checked out, is its latest flight and moves the meters on; an earlier one is history: locked from the start, and the meters stay as they are.

**Squawks & grounding**
- Any pilot can report a squawk and mark it as grounding the aircraft for all flying or for IFR only.
- A grounding squawk immediately makes the aircraft `grounded`, or `VFR only` if it grounds only IFR (and can notify officers).
- Each maintenance item says what happens when it's overdue: ground the aircraft, ground it for IFR only (e.g. VOR check, pitot-static), or only warn.
- A grounded aircraft can't be checked out.  A `VFR only` aircraft can, once the pilot confirms they'll fly VFR.
- **Only officers, and the aircraft's plane captains, can resolve a grounding squawk / unground an aircraft.** Resolution requires a note and records who/when.

**Pre-flight warnings** (shown on the flight log page)
- Aircraft is grounded or VFR only, and why.
- Aircraft has maintenance overdue or due soon.
- Pilot's medical / flight review is expired or expiring soon.
- Pilot is not checked out in this aircraft.

---

## 7. Task pages (v1, phone-first)

### Log a flight (target: < 30 seconds)
1. Aircraft picker: large cards with tail number + status; default to the pilot's last-flown aircraft.
2. Pre-flight warnings displayed up front.
3. Meter inputs: `out` pre-filled, pilot enters only `in` values (number pad). Only the meters this aircraft has are shown.
4. Live computed duration per meter, so typos stand out.
5. Fuel and oil added while it was out, totalled, with a form above to add more; and each totalizer's fuel remaining if the aircraft has them.
6. Optional toggle: "Report a squawk" → continues into the squawk flow with aircraft pre-selected.
7. Clear confirmation on submit.

### Report a squawk (one-thumb usable)
1. Aircraft pre-selected when coming from a flight; otherwise a picker.
2. First question, big buttons: **"Does this ground the airplane?"** Yes / No IFR, VFR only / No.
3. Short description; optional category.
4. Photos straight from the camera.
5. Confirmation showing the aircraft's updated status.

### Reports
- For officers (every aircraft) and plane captains (their own), on a tablet or computer; not offered on phones, where the tables don't fit.
- **Oil**: each oil change (the oil, quarts put in, filter), then the hours run on it, quarts added on flights until the next change, and hours per quart; the oil in it now so far.
- **Mechanic's report**: from the last completion of the aircraft's **Annual** item: squawks reported since (and any older still open) with their status and resolution, maintenance logged since, every open item's next due, and each AD and SB: its number, subject, what it applies to, status (complied with, recurring and next due, open, or not applicable) and method of compliance.
- **Flights**: for a period and one or all aircraft, hours by aircraft and by pilot (with what each flew), and every flight.  Hours are billed hours, or those run on a chosen kind of meter (Hobbs, tach, air time); a flight with no reading on that meter counts as a flight but not toward the hours.
- Each renders as a page and saves as a PDF through the browser's print dialog, with a print layout (no navigation, ink on white, letter pages).

### What's new
- After a release, the first page a member opens shows a popup of brief highlights: every release since they last saw one, not just the latest, newest first. Bullets can be aimed at pilots, officers or plane captains; others don't see them.
- Closing it marks everything seen. New members start up to date. The full list stays under "What's new" in the account menu.

### Also needed (simpler, officer-facing)
- Fleet status overview (what's flyable, what's coming due)
- Manage members & role tags
- Manage aircraft & their meters / billing and logbook meters
- Manage maintenance items; log maintenance completion (officers and the aircraft's captains)
- Resolve squawks (officers and the aircraft's captains)
- Assign plane captains
- Edit locked flights (audited)

Build these by hand as needed; no generic admin framework for now. Drizzle Studio is fine for the developer's occasional data fixes but not for officers.

---

## 8. Mobile & usability guidelines

- **Mobile-first layouts:** design for phone width, widen with Tailwind breakpoint prefixes (`md:`, `lg:`).
- **Minimal typing:** pre-fill pilot, date, aircraft, `out` readings; prefer pickers/steppers to text.
- **Correct keyboards:** `inputmode="decimal"` for meter readings; native date inputs.
- **Big touch targets:** ≥ 44px tall, generous spacing (cockpit, ladder, gloves).
- **Sunlight-readable:** high contrast; dark mode for night use.
- **Camera:** `<input type="file" accept="image/*">` for squawk photos.
- **Patchy connectivity:** never lose typed form data on a failed submit; allow retry. Full offline/PWA sync is **deferred** unless members ask for it.
- **Installable:** web app manifest + icon so members can add it to their home screen.
- **Long sessions:** members shouldn't have to log in on the ramp.
- **Test at phone/tablet sizes** in Playwright, and check staging on a real phone before each promotion.

---

## 9. Suggested build order

1. Repo scaffold: Next.js + TS strict, ESLint/Prettier, Tailwind + shadcn/ui, Drizzle + Postgres via Docker Compose, Vitest, Playwright.
2. Dockerfile + GitHub Actions (PR checks → staging on merge → manual promotion to production) + Render setup for both environments.
3. Auth with Better Auth, member role tags, server-side permission helpers.
4. Schema + migrations for Member, Aircraft, Meter, Flight, FlightMeterReading, Squawk, AuditLog; seed script.
5. **Log a flight** page with validation, concurrency check, and edit-lock rule (with unit + E2E tests).
6. **Report a squawk** page with grounding and photos.
7. Officer pages: resolve squawks / unground, manage aircraft & meters, manage members.
8. MaintenanceItem tracking and due-soon warnings.
9. PilotQualification tracking and pre-flight warnings.
10. README documenting how each piece works, how to run locally, how to deploy and promote, and how to restore a backup.

---

## 10. Open questions

- Can pilots delete their own flights (under the same edit-lock rule), or only edit?
- Who gets notified of a grounding squawk, and how (email, SMS, push)?
- Where to store squawk photos (Render disk vs. S3-compatible object storage — object storage recommended).
- Is a reservation/scheduling feature planned later? (Affects aircraft-picker defaults.)
- Domain name and GitHub org/repo name.

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
- id, name, email, role tags, active flag, auth fields (managed by Better Auth)

### Aircraft
- id, tail number, make/model, active flag, whether it has a fuel totalizer
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
- Fuel added (gallons) and oil added (quarts), required (0 if none); for aircraft with a fuel totalizer, the fuel remaining it shows at the end of the flight, also required
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
- Recurring: due by **calendar time**, by **hours on the aircraft's logbook meter** (usually tach), or **whichever comes first**
- Calendar time is either months **to the end of the month** (annual, ELT, transponder: done any day in March, 12 months makes it due 31 March next year) or an **exact period** in months or days (a VOR check within the preceding 30 days)
- Last completed date/reading, interval, computed next due
- When overdue: grounds the aircraft, grounds it for IFR only, or only warns (chosen per item)

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
5. Fuel and oil added (0 if none), and the totalizer's fuel remaining if the aircraft has one.
6. Optional toggle: "Report a squawk" → continues into the squawk flow with aircraft pre-selected.
7. Clear confirmation on submit.

### Report a squawk (one-thumb usable)
1. Aircraft pre-selected when coming from a flight; otherwise a picker.
2. First question, big buttons: **"Does this ground the airplane?"** Yes / No IFR, VFR only / No.
3. Short description; optional category.
4. Photos straight from the camera.
5. Confirmation showing the aircraft's updated status.

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

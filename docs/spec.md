# Flight Club Web App — Project Spec

A website for a small flight club to **record flights**, **track maintenance and squawks**, and **track pilot qualifications**. Built by an experienced programmer who is new to web development and wants to learn modern JavaScript/TypeScript best practices along the way.

---

## 1. Goals

- Phone-first task pages for the two most common actions: **logging a flight** and **reporting a squawk**.
- A single source of truth for aircraft status, maintenance due items, and pilot currency, with cross-checks between them (e.g., warn when flying a grounded or overdue aircraft).
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
| Unit tests | **Vitest** | Currency rules, due-date math, meter logic. |
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
- All permission checks are enforced **on the server**, not just by hiding buttons in the UI.
- Every member logs in with their own account.

---

## 5. Data model (v1)

### Member
- id, name, email, role tags, active flag, auth fields (managed by Better Auth)

### Aircraft
- id, tail number, make/model, active flag
- `billingMeterId` → references one of this aircraft's meters
- Status is **derived**: `grounded` if any open squawk on it has `grounds = true`; otherwise `airworthy`. (Overdue maintenance shows as a warning; whether it also grounds is an open question, see §10.)

### Meter (configurable per aircraft)
Aircraft have different instruments, so meters are rows, not fixed columns.
- id, aircraftId, `kind`: `tach` | `hobbs` | `air_time`, display label, `currentReading` (decimal)

Meter definitions:
- **Tach**: engine time scaled by RPM. Most maintenance intervals use this.
- **Hobbs**: engine run time (engine/oil-pressure switch on).
- **Air time**: runs only while airborne (squat or airspeed switch). Deliberately *not* called "flight time", which has a regulatory pilot-logbook meaning.

Most aircraft have tach + Hobbs; one club aircraft has all three; some may have only tach.

### Flight
- id, aircraftId, pilotId, date, day landings, night landings, notes
- Snapshot at time of logging: `billingMeterKind`, `billedHours` (so changing an aircraft's billing meter later never re-bills past flights)
- createdAt, updatedAt, lockedAt (see rules)

### FlightMeterReading
- flightId, meterId, `out`, `in`
- One row per meter the aircraft has.

### Squawk
- id, aircraftId, reportedById, reportedAt, description, category (engine, avionics, airframe, other), `grounds` (bool)
- status: `open` | `deferred` | `resolved`
- resolvedById, resolvedAt, resolutionNote
- Photos (stored in object storage; URLs on a SquawkPhoto table)

### MaintenanceItem
- id, aircraftId, name (annual, 100-hour, ELT, transponder, pitot-static, AD #…, etc.)
- Due by **date**, by **hours on a specified meter** (usually tach), or **whichever comes first**
- Last completed date/reading, interval, computed next due

### PilotQualification
- Medical (class, expiration), flight review (date → expiration), per-aircraft checkouts
- 90-day passenger currency is **computed** from logged landings (day/night), not entered.

### AuditLog
- Who changed what, when, before/after. Required for officer edits to locked flights and for squawk resolution.

---

## 6. Business rules

**Meters & billing**
- Each aircraft's billing meter is a setting (any of its meters; typically Hobbs or tach).
- Every flight records **all** of the aircraft's meters, regardless of which one bills.
- Logging a flight updates each meter's `currentReading` to the flight's `in` value.

**Flight entry validation**
- `out` readings pre-fill from the aircraft's current readings.
- `in` must be greater than `out` for every meter (hard error).
- Unusually large values (e.g., > 10 hours) produce a "did you mean…?" warning, not a block.
- **Concurrency:** save the flight in a DB transaction that verifies each meter's `out` still equals the meter's `currentReading`. If not, reject with "This aircraft was just updated — please review" rather than corrupting totals.

**Editing flights**
- A pilot may edit their own flight **until the next flight is logged on that aircraft**; then it locks.
- Officers can edit locked flights; every such edit writes to the AuditLog.

**Squawks & grounding**
- Any pilot can report a squawk and mark it as grounding.
- A grounding squawk immediately makes the aircraft `grounded` (and can notify officers).
- **Only members tagged `officer` can resolve a grounding squawk / unground an aircraft.** Resolution requires a note and records who/when.

**Pre-flight warnings** (shown on the flight log page)
- Aircraft has an open grounding squawk.
- Aircraft has maintenance overdue or due soon.
- Pilot's medical / flight review is expired or expiring soon.
- Pilot is not checked out in this aircraft.
- Pilot lacks 90-day currency (relevant for carrying passengers).

---

## 7. Task pages (v1, phone-first)

### Log a flight (target: < 30 seconds)
1. Aircraft picker: large cards with tail number + status; default to the pilot's last-flown aircraft.
2. Pre-flight warnings displayed up front.
3. Meter inputs: `out` pre-filled, pilot enters only `in` values (number pad). Only the meters this aircraft has are shown.
4. Live computed duration per meter, so typos stand out.
5. Day/night landings via +/− steppers (default 1 day landing).
6. Optional toggle: "Report a squawk" → continues into the squawk flow with aircraft pre-selected.
7. Clear confirmation on submit.

### Report a squawk (one-thumb usable)
1. Aircraft pre-selected when coming from a flight; otherwise a picker.
2. First question, big yes/no: **"Does this ground the airplane?"**
3. Short description; optional category.
4. Photos straight from the camera.
5. Confirmation showing the aircraft's updated status.

### Also needed (simpler, officer-facing)
- Fleet status overview (what's flyable, what's coming due)
- Manage members & role tags
- Manage aircraft & their meters / billing meter
- Manage maintenance items; log maintenance completion
- Resolve squawks
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
9. PilotQualification tracking, computed currency, pre-flight warnings.
10. README documenting how each piece works, how to run locally, how to deploy and promote, and how to restore a backup.

---

## 10. Open questions

- Should overdue maintenance automatically ground an aircraft, or only warn?
- Can pilots delete their own flights (under the same edit-lock rule), or only edit?
- Who gets notified of a grounding squawk, and how (email, SMS, push)?
- Where to store squawk photos (Render disk vs. S3-compatible object storage — object storage recommended).
- Is a reservation/scheduling feature planned later? (Affects aircraft-picker defaults.)
- Domain name and GitHub org/repo name.

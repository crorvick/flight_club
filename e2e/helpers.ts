import { execFileSync } from "node:child_process";

import { expect, type Page, type TestInfo } from "@playwright/test";
import postgres from "postgres";

// CI sets DATABASE_URL; locally it comes from .env, like the dev server's.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env: rely on the environment.
}

// Unique per test and per project, since every device project runs the
// whole suite against the same database.
export function uniqueId(testInfo: TestInfo) {
  return `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newMember(testInfo: TestInfo) {
  const id = uniqueId(testInfo);
  return {
    name: `Test ${id}`,
    email: `${id}@example.com`,
    password: "correct horse battery",
  };
}

export type TestMember = ReturnType<typeof newMember>;

export async function signUp(page: Page, member: TestMember) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(member.name);
  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Password").fill(member.password);
  await page.getByRole("button", { name: "Create account" }).click();
}

// From the account menu in the header.
export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
}

export function approve(email: string, ...roles: string[]) {
  execFileSync("pnpm", ["-s", "member:approve", email, ...roles], {
    stdio: "pipe",
  });
}

// A signed-in, approved member of the test's own, a pilot unless other
// roles are given.
export async function signUpPilot(
  page: Page,
  testInfo: TestInfo,
  roles: string[] = ["pilot"],
) {
  const pilot = newMember(testInfo);
  await signUp(page, pilot);
  await expect(page.getByRole("status")).toBeVisible();
  approve(pilot.email, ...roles);
  return pilot;
}

let client: postgres.Sql | undefined;

// Direct database access, for setting up what the app has no pages for
// yet (aircraft, squawks).
export function sql() {
  client ??= postgres(process.env.DATABASE_URL!, {
    max: 2,
    onnotice: () => {},
  });
  return client;
}

export async function closeSql() {
  await client?.end();
  client = undefined;
}

type MeterKind = "tach" | "hobbs" | "air_time";

// An aircraft of the test's own, so tests running in parallel never log
// against each other's meters.  The tail number is unique but short
// enough for the picker cards.
export async function createAircraft(
  testInfo: TestInfo,
  meters: Partial<Record<MeterKind, string>>,
  billing: MeterKind,
) {
  const tailNumber = `T${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const db = sql();
  const [{ id }] = await db`
    insert into aircraft (tail_number, make_model)
    values (${tailNumber}, ${`E2E ${testInfo.project.name}`})
    returning id
  `;
  const labels = { tach: "Tach", hobbs: "Hobbs", air_time: "Air time" };
  // The logbook time is the tach when it has one, as for most aircraft.
  const logbook = "tach" in meters ? "tach" : billing;
  for (const [kind, reading] of Object.entries(meters)) {
    const [meter] = await db`
      insert into meter (aircraft_id, kind, label, current_reading)
      values (${id}, ${kind}, ${labels[kind as MeterKind]}, ${reading})
      returning id
    `;
    if (kind === billing) {
      await db`update aircraft set billing_meter_id = ${meter.id} where id = ${id}`;
    }
    if (kind === logbook) {
      await db`update aircraft set logbook_meter_id = ${meter.id} where id = ${id}`;
    }
  }
  return { id: id as string, tailNumber };
}

export async function deleteAircraft(id: string) {
  const db = sql();
  await db.begin(async (tx) => {
    await tx`
      delete from audit_log where entity_id in (
        select id from dispatch where aircraft_id = ${id}
      )
    `;
    await tx`delete from dispatch where aircraft_id = ${id}`;
    await tx`
      delete from audit_log where entity_id in (
        select id from flight where aircraft_id = ${id}
      )
    `;
    await tx`delete from flight where aircraft_id = ${id}`;
    await tx`
      delete from audit_log where entity_id in (
        select id from squawk where aircraft_id = ${id}
      )
    `;
    await tx`delete from squawk where aircraft_id = ${id}`;
    await tx`delete from maintenance_item where aircraft_id = ${id}`;
    await tx`
      update aircraft set billing_meter_id = null, logbook_meter_id = null
      where id = ${id}
    `;
    await tx`delete from meter where aircraft_id = ${id}`;
    await tx`delete from aircraft where id = ${id}`;
  });
}

export async function createSquawk(
  aircraftId: string,
  squawk: { description: string; grounds: boolean | "ifr" },
) {
  const grounding =
    squawk.grounds === "ifr" ? "ifr" : squawk.grounds ? "all" : "none";
  const db = sql();
  // Any member will do; a seeded one rather than another test's, which
  // the clean-up might be about to remove.
  const [{ id: reporterId }] = await db`
    select id from member order by created_at limit 1
  `;
  const [{ id }] = await db`
    insert into squawk (
      aircraft_id, reported_by_id, description, grounding
    )
    values (
      ${aircraftId}, ${reporterId}, ${squawk.description}, ${grounding}
    )
    returning id
  `;
  return id as string;
}

type Plane = { id: string; tailNumber: string };

export async function openCheckOut(page: Page, plane: Plane) {
  await page.goto(`/check-out?aircraft=${plane.id}`);
  await expect(
    page.getByRole("button", { name: `Check out ${plane.tailNumber}` }),
  ).toBeVisible();
}

// Check an aircraft out, entering any readings that differ from what the
// app shows (by meter label), acknowledging every open squawk, and
// agreeing to fly VFR if it's limited to that.
export async function checkOut(
  page: Page,
  plane: Plane,
  readings: Record<string, string> = {},
) {
  await openCheckOut(page, plane);
  for (const [label, value] of Object.entries(readings)) {
    await page.getByLabel(`${label} reads`).fill(value);
  }
  for (const box of await page
    .getByRole("checkbox", { name: /I've read this|I'll fly VFR only/ })
    .all()) {
    await box.check();
  }
  await page
    .getByRole("button", { name: `Check out ${plane.tailNumber}` })
    .click();
  await expect(
    page.getByRole("heading", { name: `You have ${plane.tailNumber}` }),
  ).toBeVisible();
}

// On the check-in page: fill the in readings (by meter label), the fuel
// and oil added (none unless given), the totalizer if given, and submit.
export async function checkIn(
  page: Page,
  plane: Plane,
  ins: Record<string, string>,
  fluids: { fuel?: string; oil?: string; totalizer?: string } = {},
) {
  for (const [label, value] of Object.entries(ins)) {
    await page.getByLabel(`${label} in`).fill(value);
  }
  await page.getByLabel("Fuel added (gal)").fill(fluids.fuel ?? "0");
  await page.getByLabel("Oil added (qt)").fill(fluids.oil ?? "0");
  if (fluids.totalizer !== undefined) {
    await page
      .getByLabel("Totalizer fuel remaining (gal)")
      .fill(fluids.totalizer);
  }
  await page
    .getByRole("button", { name: `Check in ${plane.tailNumber}` })
    .click();
}

// A whole flight: check out, check in, and return the flight's page.
export async function logFlight(
  page: Page,
  plane: Plane,
  ins: Record<string, string>,
) {
  await checkOut(page, plane);
  await checkIn(page, plane, ins);
  await expect(page.getByText("Flight logged.")).toBeVisible();
  return page.url().split("?")[0];
}

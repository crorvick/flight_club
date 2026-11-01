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

export function approve(email: string, ...roles: string[]) {
  execFileSync("pnpm", ["-s", "member:approve", email, ...roles], {
    stdio: "pipe",
  });
}

// A signed-in, approved pilot of the test's own.
export async function signUpPilot(page: Page, testInfo: TestInfo) {
  const pilot = newMember(testInfo);
  await signUp(page, pilot);
  await expect(page.getByRole("status")).toBeVisible();
  approve(pilot.email, "pilot");
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
  for (const [kind, reading] of Object.entries(meters)) {
    const [meter] = await db`
      insert into meter (aircraft_id, kind, label, current_reading)
      values (${id}, ${kind}, ${labels[kind as MeterKind]}, ${reading})
      returning id
    `;
    if (kind === billing) {
      await db`update aircraft set billing_meter_id = ${meter.id} where id = ${id}`;
    }
  }
  return { id: id as string, tailNumber };
}

export async function deleteAircraft(id: string) {
  const db = sql();
  await db.begin(async (tx) => {
    await tx`delete from flight where aircraft_id = ${id}`;
    await tx`delete from squawk where aircraft_id = ${id}`;
    await tx`update aircraft set billing_meter_id = null where id = ${id}`;
    await tx`delete from meter where aircraft_id = ${id}`;
    await tx`delete from aircraft where id = ${id}`;
  });
}

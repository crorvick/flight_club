import { expect, test, type Page } from "@playwright/test";

import {
  closeSql,
  createAircraft,
  checkOut,
  deleteAircraft,
  logFlight,
  openCheckOut,
  signUpPilot,
  sql,
} from "./helpers";

// Aircraft the test created through the UI, to clean up afterwards.
const created: string[] = [];

test.beforeEach(async ({ page }, testInfo) => {
  await signUpPilot(page, testInfo, ["officer", "pilot"]);
});

test.afterEach(async () => {
  for (const id of created.splice(0)) await deleteAircraft(id);
});

test.afterAll(async () => {
  await closeSql();
});

function newTailNumber() {
  return `N${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

async function idOf(tailNumber: string) {
  const [row] =
    await sql()`select id from aircraft where tail_number = ${tailNumber}`;
  return row.id as string;
}

async function addAircraft(page: Page, tailNumber: string) {
  await page.goto("/aircraft/new");
  await page.getByLabel("Tail number").fill(tailNumber.toLowerCase());
  await page.getByLabel("Make and model").fill("Cessna 152");
  await page.getByLabel("Hobbs", { exact: true }).fill("2000.0");
  await page.getByLabel("Tach", { exact: true }).fill("1800.5");
  await page.getByLabel("Bills by Hobbs").check();
  await page.getByRole("button", { name: "Add aircraft" }).click();
  await expect(page.getByText("Aircraft added.")).toBeVisible();
  created.push(await idOf(tailNumber));
}

test("an officer adds an aircraft that pilots can then log", async ({
  page,
}) => {
  const tail = newTailNumber();
  await addAircraft(page, tail);
  await expect(page.getByRole("heading", { name: tail })).toBeVisible();

  const plane = { id: created[0], tailNumber: tail };
  await openCheckOut(page, plane);
  await expect(page.getByLabel("Hobbs reads")).toHaveValue("2000.0");
  await expect(page.getByLabel("Tach reads")).toHaveValue("1800.5");
  await expect(page.getByLabel("Hobbs reads")).toHaveAccessibleName(/billed/);
});

test("a duplicate tail number is rejected and the form kept", async ({
  page,
}, testInfo) => {
  const existing = await createAircraft(testInfo, { tach: "10.00" }, "tach");
  created.push(existing.id);

  await page.goto("/aircraft/new");
  await page.getByLabel("Tail number").fill(existing.tailNumber);
  await page.getByLabel("Make and model").fill("Piper Cub");
  await page.getByLabel("Tach", { exact: true }).fill("10.0");
  await page.getByLabel("Bills by Tach").check();
  await page.getByRole("button", { name: "Add aircraft" }).click();
  await expect(
    page.getByText("That tail number is already in the fleet."),
  ).toBeVisible();
  await expect(page.getByLabel("Make and model")).toHaveValue("Piper Cub");
});

test("correcting a meter needs a reason and moves the next out reading", async ({
  page,
}, testInfo) => {
  const plane = await createAircraft(
    testInfo,
    { hobbs: "500.00", tach: "400.00" },
    "hobbs",
  );
  created.push(plane.id);

  await page.goto(`/aircraft/${plane.id}`);
  await page.getByLabel("Tach reading").fill("401.5");
  await page.getByRole("button", { name: "Save Tach" }).click();
  await expect(
    page.getByText("Say why the reading is changing."),
  ).toBeVisible();

  await page
    .getByLabel("Reason for correcting Tach")
    .fill("Last pilot forgot to log a flight.");
  await page.getByRole("button", { name: "Save Tach" }).click();
  await expect(page.getByText("Meters saved.")).toBeVisible();
  await expect(page.getByLabel("Tach reading")).toHaveValue("401.5");

  const [entry] = await sql()`
    select a.after from audit_log a
    join meter m on m.id = a.entity_id
    where m.aircraft_id = ${plane.id} and a.action = 'meter.update'
  `;
  expect(entry.after).toEqual({
    currentReading: "401.50",
    reason: "Last pilot forgot to log a flight.",
  });

  await openCheckOut(page, plane);
  await expect(page.getByLabel("Tach reads")).toHaveValue("401.5");
});

test("changing the billing meter bills new flights by it", async ({
  page,
}, testInfo) => {
  const plane = await createAircraft(
    testInfo,
    { hobbs: "500.00", tach: "400.00" },
    "hobbs",
  );
  created.push(plane.id);

  await page.goto(`/aircraft/${plane.id}`);
  await page
    .getByRole("group", { name: "Billed by" })
    .getByLabel("Tach")
    .check();
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();

  await logFlight(page, plane, { Hobbs: "501.5", Tach: "401.2" });
  await expect(page.getByText("1.2 hours (tach)")).toBeVisible();
});

test("meters can be added, and removed until a flight records them", async ({
  page,
}, testInfo) => {
  const plane = await createAircraft(testInfo, { tach: "400.00" }, "tach");
  created.push(plane.id);

  await page.goto(`/aircraft/${plane.id}`);
  // The billing meter can't be removed.
  await expect(page.getByRole("button", { name: "Remove Tach" })).toHaveCount(
    0,
  );

  await page.getByLabel("Kind").selectOption("Hobbs");
  await page.getByLabel("Current reading").fill("450.0");
  await page.getByRole("button", { name: "Add meter" }).click();
  await expect(page.getByText("Meters saved.")).toBeVisible();
  await page.getByRole("button", { name: "Remove Hobbs" }).click();
  await expect(page.getByLabel("Hobbs reading")).toHaveCount(0);

  await page.getByLabel("Kind").selectOption("Hobbs");
  await page.getByLabel("Current reading").fill("450.0");
  await page.getByRole("button", { name: "Add meter" }).click();
  await expect(page.getByLabel("Hobbs reading")).toBeVisible();

  // Once a flight has recorded it, it stays.
  await logFlight(page, plane, { Hobbs: "451.0", Tach: "400.8" });
  await page.goto(`/aircraft/${plane.id}`);
  await expect(page.getByLabel("Hobbs reading")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Hobbs" })).toHaveCount(
    0,
  );
});

test("an officer marks an aircraft as having a fuel totalizer", async ({
  page,
}, testInfo) => {
  const plane = await createAircraft(testInfo, { tach: "400.00" }, "tach");
  created.push(plane.id);

  await page.goto(`/aircraft/${plane.id}`);
  await page.getByLabel(/Has a fuel totalizer/).check();
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();
  await expect(page.getByLabel(/Has a fuel totalizer/)).toBeChecked();

  await checkOut(page, plane);
  await expect(page.getByLabel("Totalizer fuel remaining (gal)")).toBeVisible();
});

test("an inactive aircraft can't be picked", async ({ page }, testInfo) => {
  const plane = await createAircraft(testInfo, { tach: "400.00" }, "tach");
  created.push(plane.id);

  await page.goto(`/aircraft/${plane.id}`);
  await page.getByLabel(/^Active/).uncheck();
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();

  await page.goto("/check-out");
  await expect(
    page.getByRole("link", { name: new RegExp(plane.tailNumber) }),
  ).toHaveCount(0);
});

test("pilots can't manage aircraft", async ({ browser }, testInfo) => {
  // A browser of their own: the page fixture is signed in as an officer.
  const context = await browser.newContext();
  const page = await context.newPage();
  await signUpPilot(page, testInfo);
  await page.goto("/aircraft");
  await expect(page.getByText("Not allowed")).toBeVisible();
  await context.close();
});

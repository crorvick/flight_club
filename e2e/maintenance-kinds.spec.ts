import { expect, type Page, test } from "@playwright/test";

import {
  checkOut,
  closeSql,
  createAircraft,
  deleteAircraft,
  signUpPilot,
  sql,
} from "./helpers";

let aircraft: { id: string; tailNumber: string };

test.beforeEach(async ({ page }, testInfo) => {
  aircraft = await createAircraft(
    testInfo,
    { hobbs: "500.00", tach: "400.00" },
    "hobbs",
  );
  await signUpPilot(page, testInfo, ["officer", "pilot"]);
});

test.afterEach(async () => {
  await deleteAircraft(aircraft.id);
});

test.afterAll(async () => {
  await closeSql();
});

const twin = () =>
  sql()`update aircraft set engine_count = 2 where id = ${aircraft.id}`;

// Add an item of a kind, done a few days ago, and open it.
async function addItem(
  page: Page,
  item: { name: string; kind: string; days?: string; hours?: string },
) {
  await page.goto(`/aircraft/${aircraft.id}/maintenance`);
  await page.getByLabel("Name").fill(item.name);
  await page.getByLabel("Kind").selectOption({ label: item.kind });
  if (item.days) {
    await page.getByLabel("Calendar time").fill(item.days);
    await page.getByLabel("In", { exact: true }).selectOption("days");
  }
  if (item.hours) {
    await page.getByLabel("Hours", { exact: true }).fill(item.hours);
    await page.getByLabel("Logbook reading").fill("380.0");
  }
  await page.getByLabel("Date").fill("2026-10-20");
  await page.getByLabel(/Only warn/).check();
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Item added.")).toBeVisible();
}

const logCompletion = (page: Page) =>
  page.getByRole("button", { name: "Log completion" }).click();

test("a VOR check records how, where and the bearing errors", async ({
  page,
}) => {
  await addItem(page, { name: "VOR check", kind: "VOR check", days: "30" });

  await page.getByLabel("Checked against").selectOption("vot");
  await page.getByLabel("Where").fill("KMSP VOT");
  await page.getByLabel("NAV 1 error (°)").fill("5");
  await logCompletion(page);
  await expect(
    page.getByText("More than the ±4° allowed for this check."),
  ).toBeVisible();

  await page.getByLabel("NAV 1 error (°)").fill("+2");
  await page.getByLabel("NAV 2 error (°)").fill("-1");
  await logCompletion(page);
  await expect(page.getByText("Completion logged.")).toBeVisible();
  await expect(
    page.getByText("VOT at KMSP VOT: NAV 1 +2°, NAV 2 −1°"),
  ).toBeVisible();

  // A dual check compares the receivers instead.
  await page.getByLabel("Checked against").selectOption("dual");
  await expect(page.getByLabel("NAV 1 error (°)")).toHaveCount(0);
  await expect(
    page.getByLabel("Difference between receivers (°)"),
  ).toBeVisible();
});

test("an oil change on a twin records each engine's oil", async ({ page }) => {
  await twin();
  await addItem(page, { name: "Oil change", kind: "Oil change", hours: "50" });

  await page.getByLabel("Oil put in, left (qt)").fill("6");
  await logCompletion(page);
  await expect(
    page.getByText("Enter the oil put in the right engine."),
  ).toBeVisible();
  await expect(
    page.getByText("Enter the oil used, e.g. AeroShell W100."),
  ).toBeVisible();

  await page.getByLabel("Oil put in, right (qt)").fill("6.5");
  await page.getByLabel("Oil used").fill("AeroShell W100");
  await logCompletion(page);
  await expect(page.getByText("Completion logged.")).toBeVisible();
  await expect(
    page.getByText(
      "Left 6.0 qt, right 6.5 qt of AeroShell W100; filter replaced",
    ),
  ).toBeVisible();

  // Next time it suggests the same oil.
  await expect(page.getByLabel("Oil used")).toHaveValue("AeroShell W100");
});

test("checking in a twin asks for each engine's oil", async ({ page }) => {
  await twin();
  await checkOut(page, aircraft);
  await page.getByLabel("Hobbs in").fill("501.5");
  await page.getByLabel("Tach in").fill("401.2");
  await page.getByLabel("Fuel added (gal)").fill("20");
  await page.getByLabel("Oil added, left (qt)").fill("1");
  await page
    .getByRole("button", { name: `Check in ${aircraft.tailNumber}` })
    .click();
  await expect(
    page.getByText("Enter the oil added, or 0 if none."),
  ).toBeVisible();

  await page.getByLabel("Oil added, right (qt)").fill("0.5");
  await page
    .getByRole("button", { name: `Check in ${aircraft.tailNumber}` })
    .click();
  await expect(page.getByText("Flight logged.")).toBeVisible();
  await expect(
    page.getByText("Oil added, right", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("0.5 qt")).toBeVisible();
});

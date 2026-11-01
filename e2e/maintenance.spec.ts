import { expect, test, type Page } from "@playwright/test";

import {
  closeSql,
  createAircraft,
  deleteAircraft,
  signUpPilot,
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

function monthsAgo(months: number) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

async function addItem(
  page: Page,
  item: {
    name: string;
    months?: string;
    hours?: string;
    lastOn: string;
    lastReading?: string;
    grounds?: boolean;
  },
) {
  await page.goto(`/aircraft/${aircraft.id}/maintenance`);
  await page.getByLabel("Name").fill(item.name);
  if (item.months) await page.getByLabel("Calendar months").fill(item.months);
  if (item.hours) {
    await page.getByLabel("Hours", { exact: true }).fill(item.hours);
    await page.getByLabel("On the").selectOption({ label: "Tach" });
  }
  await page.getByLabel("Date").fill(item.lastOn);
  if (item.lastReading) {
    await page.getByLabel("At meter reading").fill(item.lastReading);
  }
  if (item.grounds === false) {
    await page.getByLabel(/Grounds the aircraft when overdue/).uncheck();
  }
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Item added.")).toBeVisible();
}

test("an overdue item that grounds grounds the aircraft until it's done", async ({
  page,
}) => {
  await addItem(page, {
    name: "Annual inspection",
    months: "12",
    lastOn: monthsAgo(14),
  });
  await expect(
    page.getByText("Overdue: the aircraft is grounded"),
  ).toBeVisible();

  await page.goto(`/flights/new?aircraft=${aircraft.id}`);
  await expect(
    page.getByText(`${aircraft.tailNumber} is grounded`),
  ).toBeVisible();
  await expect(
    page.getByText(/Annual inspection: \d+ days overdue/),
  ).toBeVisible();

  await page.goto("/fleet");
  await expect(
    page.getByRole("region", { name: aircraft.tailNumber }),
  ).toContainText("Grounded");

  await page.goto(`/aircraft/${aircraft.id}/maintenance`);
  await page.getByRole("link", { name: /Annual inspection/ }).click();
  await page.getByLabel("Note (optional)").fill("Annual by Smith Aviation.");
  await page.getByRole("button", { name: "Log completion" }).click();
  await expect(page.getByText("Completion logged.")).toBeVisible();
  await expect(page.getByText("Not due yet")).toBeVisible();
  await expect(page.getByText("Annual by Smith Aviation.")).toBeVisible();

  await page.goto("/fleet");
  await expect(
    page.getByRole("region", { name: aircraft.tailNumber }),
  ).toContainText("Airworthy");
});

test("an hours item that only warns is flagged but doesn't ground", async ({
  page,
}) => {
  await addItem(page, {
    name: "Oil change",
    hours: "50",
    lastOn: monthsAgo(1),
    lastReading: "355.0",
    grounds: false,
  });
  // 5 hours left on the tach.
  await expect(page.getByText("Due soon")).toBeVisible();

  await page.goto(`/flights/new?aircraft=${aircraft.id}`);
  await expect(page.getByText("Maintenance due soon")).toBeVisible();
  await expect(
    page.getByText("Oil change: due at 405.0 on the tach (5.0 hours left)"),
  ).toBeVisible();

  // Fly past it.
  await page.getByLabel("Hobbs in").fill("507.0");
  await page.getByLabel("Tach in").fill("406.0");
  await page
    .getByRole("button", { name: `Log flight in ${aircraft.tailNumber}` })
    .click();
  await expect(page.getByText("Flight logged.")).toBeVisible();

  await page.goto(`/flights/new?aircraft=${aircraft.id}`);
  await expect(
    page.getByText("Oil change: 1.0 hours overdue on the tach"),
  ).toBeVisible();
  await expect(
    page.getByText(`${aircraft.tailNumber} is grounded`),
  ).toHaveCount(0);
});

test("an item needs an interval, and a reading for hours", async ({ page }) => {
  await page.goto(`/aircraft/${aircraft.id}/maintenance`);
  await page.getByLabel("Name").fill("Mystery item");
  await page.getByLabel("Date").fill(monthsAgo(1));
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(
    page.getByText("Give a number of months, hours, or both."),
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Mystery item");

  await page.getByLabel("Hours", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(
    page.getByText("Enter that meter's reading when it was last done."),
  ).toBeVisible();
});

test("pilots can't manage maintenance", async ({ browser }, testInfo) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signUpPilot(page, testInfo);
  await page.goto(`/aircraft/${aircraft.id}/maintenance`);
  await expect(page.getByText("Not allowed")).toBeVisible();
  await context.close();
});

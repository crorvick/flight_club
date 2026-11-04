import { expect, test, type Page } from "@playwright/test";

import { formatDate } from "../src/lib/dates";
import { addMonths } from "../src/lib/maintenance";

import {
  closeSql,
  createAircraft,
  deleteAircraft,
  logFlight,
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

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

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
    days?: string;
    exact?: boolean;
    hours?: string;
    lastOn: string;
    lastReading?: string;
    grounds?: boolean | "ifr";
  },
) {
  await page.goto(`/aircraft/${aircraft.id}/maintenance`);
  await page.getByLabel("Name").fill(item.name);
  if (item.months || item.days) {
    await page.getByLabel("Calendar time").fill((item.months ?? item.days)!);
    await page
      .getByLabel("In", { exact: true })
      .selectOption(item.months ? "months" : "days");
  }
  if (item.exact) await page.getByLabel("To the day").check();
  if (item.hours) {
    await page.getByLabel("Hours", { exact: true }).fill(item.hours);
  }
  await page.getByLabel("Last done on").fill(item.lastOn);
  if (item.lastReading) {
    await page.getByLabel("Logbook reading").fill(item.lastReading);
  }
  if (item.grounds === false) await page.getByLabel(/Only warn/).check();
  if (item.grounds === "ifr") {
    await page.getByLabel(/Ground it for IFR only/).check();
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

  await page.goto(`/check-out?aircraft=${aircraft.id}`);
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

  await page.goto(`/check-out?aircraft=${aircraft.id}`);
  await expect(page.getByText("Maintenance due soon")).toBeVisible();
  await expect(
    page.getByText("Oil change: due at 405.0 on the tach (5.0 hours left)"),
  ).toBeVisible();

  // Fly past it.
  await logFlight(page, aircraft, { Hobbs: "507.0", Tach: "406.0" });

  await page.goto(`/check-out?aircraft=${aircraft.id}`);
  await expect(
    page.getByText("Oil change: 1.0 hours overdue on the tach"),
  ).toBeVisible();
  await expect(
    page.getByText(`${aircraft.tailNumber} is grounded`),
  ).toHaveCount(0);
});

test("a day interval is due exactly that many days later", async ({ page }) => {
  await addItem(page, {
    name: "VOR check",
    days: "30",
    lastOn: daysAgo(25),
    grounds: false,
  });
  // A quarter of 30 days: due soon from 7 days out, not 30.
  await expect(page.getByText("Due soon")).toBeVisible();
  await expect(
    page.getByText(`due ${formatDate(daysAgo(-5))} (5 days)`, { exact: false }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Log completion" }).click();
  await expect(page.getByText("Completion logged.")).toBeVisible();
  await expect(page.getByText("Not due yet")).toBeVisible();
});

test("months can run to the day instead of the month's end", async ({
  page,
}) => {
  const lastOn = daysAgo(10);
  await addItem(page, {
    name: "Fire extinguisher",
    months: "1",
    exact: true,
    lastOn,
    grounds: false,
  });
  // A month to the day, not the end of next month.
  await expect(
    page.getByText(`due ${formatDate(addMonths(lastOn, 1))}`, { exact: false }),
  ).toBeVisible();
});

test("an overdue IFR item limits the aircraft to VFR", async ({ page }) => {
  await addItem(page, {
    name: "VOR check",
    days: "30",
    lastOn: daysAgo(35),
    grounds: "ifr",
  });
  await expect(
    page.getByText("Overdue: the aircraft is VFR only"),
  ).toBeVisible();

  await page.goto(`/check-out?aircraft=${aircraft.id}`);
  await expect(
    page.getByText(`${aircraft.tailNumber} is VFR only`),
  ).toBeVisible();
  await expect(page.getByText(/VOR check: 5 days overdue/)).toBeVisible();
  await page.goto("/fleet");
  await expect(
    page.getByRole("region", { name: aircraft.tailNumber }),
  ).toContainText("VFR only");
});

test("an item needs an interval, and a reading for hours", async ({ page }) => {
  await page.goto(`/aircraft/${aircraft.id}/maintenance`);
  await page.getByLabel("Name").fill("Mystery item");
  await page.getByLabel("Last done on").fill(monthsAgo(1));
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(
    page.getByText("Give a calendar interval, hours, or both."),
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Mystery item");

  await page.getByLabel("Hours", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(
    page.getByText("Enter the logbook reading when it was last done."),
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

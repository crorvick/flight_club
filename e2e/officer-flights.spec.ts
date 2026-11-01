import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  closeSql,
  createAircraft,
  deleteAircraft,
  signUpPilot,
  sql,
} from "./helpers";

let aircraft: { id: string; tailNumber: string };

test.beforeEach(async ({}, testInfo) => {
  aircraft = await createAircraft(
    testInfo,
    { hobbs: "100.00", tach: "80.00" },
    "hobbs",
  );
});

test.afterEach(async () => {
  await deleteAircraft(aircraft.id);
});

test.afterAll(async () => {
  await closeSql();
});

async function logFlight(page: Page, hobbs: string, tach: string) {
  await page.goto(`/flights/new?aircraft=${aircraft.id}`);
  await page.getByLabel("Hobbs in").fill(hobbs);
  await page.getByLabel("Tach in").fill(tach);
  await page
    .getByRole("button", { name: `Log flight in ${aircraft.tailNumber}` })
    .click();
  await expect(page.getByText("Flight logged.")).toBeVisible();
  return page.url().split("?")[0];
}

async function officerPage(
  browser: Browser,
  testInfo: Parameters<typeof signUpPilot>[1],
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const officer = await signUpPilot(page, testInfo, ["officer"]);
  return { page, officer, close: () => context.close() };
}

test("an officer corrects a locked flight, with a reason, audited", async ({
  page,
  browser,
}, testInfo) => {
  await signUpPilot(page, testInfo);
  const first = await logFlight(page, "101.5", "81.2");
  await logFlight(page, "102.5", "82.0");

  const officer = await officerPage(browser, testInfo);
  await officer.page.goto(first);
  await expect(officer.page.getByText("Locked:")).toBeVisible();
  await officer.page
    .getByRole("link", { name: "Correct flight (officer)" })
    .click();

  await officer.page.getByLabel("Hobbs in").fill("101.8");
  await officer.page.getByRole("button", { name: "Save correction" }).click();
  await expect(
    officer.page.getByText("Say why the flight is being changed."),
  ).toBeVisible();
  await expect(officer.page.getByLabel("Hobbs in")).toHaveValue("101.8");

  await officer.page
    .getByLabel("Reason for the correction")
    .fill("Pilot misread the Hobbs.");
  await officer.page.getByRole("button", { name: "Save correction" }).click();
  await expect(officer.page.getByText("Flight corrected.")).toBeVisible();
  await expect(officer.page.getByText("1.8 hours (hobbs)")).toBeVisible();
  await expect(
    officer.page.getByText("Pilot misread the Hobbs."),
  ).toBeVisible();

  const [entry] = await sql()`
    select a.before, a.after from audit_log a
    where a.entity_type = 'flight' and a.entity_id = ${first.split("/").pop()!}
  `;
  expect(entry.before).toMatchObject({
    Hobbs: "100.00–101.50",
    billedHours: "1.50",
  });
  expect(entry.after).toMatchObject({
    Hobbs: "100.00–101.80",
    billedHours: "1.80",
    reason: "Pilot misread the Hobbs.",
  });

  // A locked flight isn't the latest, so the meters stay where the last
  // flight left them.
  await page.goto(`/flights/new?aircraft=${aircraft.id}`);
  await expect(page.getByText("out 102.5")).toBeVisible();
  await officer.close();
});

test("correcting the latest flight moves the meters", async ({
  page,
  browser,
}, testInfo) => {
  await signUpPilot(page, testInfo);
  const flight = await logFlight(page, "101.5", "81.2");

  const officer = await officerPage(browser, testInfo);
  await officer.page.goto(`${flight}/edit`);
  await officer.page.getByLabel("Tach in").fill("81.4");
  await officer.page
    .getByLabel("Reason for the correction")
    .fill("Tach was 81.4.");
  await officer.page.getByRole("button", { name: "Save correction" }).click();
  await expect(officer.page.getByText("Flight corrected.")).toBeVisible();

  await page.goto(`/flights/new?aircraft=${aircraft.id}`);
  await expect(page.getByText("out 81.4")).toBeVisible();
  await officer.close();
});

test("an officer can reassign a flight to another pilot", async ({
  page,
  browser,
}, testInfo) => {
  const pilot = await signUpPilot(page, testInfo);
  const flight = await logFlight(page, "101.5", "81.2");

  const officer = await officerPage(browser, testInfo);
  const other = await browser.newContext();
  const otherPilot = await signUpPilot(await other.newPage(), testInfo);
  await officer.page.goto(`${flight}/edit`);
  await officer.page
    .getByLabel("Pilot")
    .selectOption({ label: otherPilot.name });
  await officer.page
    .getByLabel("Reason for the correction")
    .fill(`Flown by ${otherPilot.name}, not ${pilot.name}.`);
  await officer.page.getByRole("button", { name: "Save correction" }).click();
  await expect(officer.page.getByText("Flight corrected.")).toBeVisible();
  await expect(officer.page.getByText(otherPilot.name).first()).toBeVisible();
  await other.close();
  await officer.close();
});

test("pilots can't correct each other's flights", async ({
  page,
  browser,
}, testInfo) => {
  await signUpPilot(page, testInfo);
  const flight = await logFlight(page, "101.5", "81.2");

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signUpPilot(otherPage, testInfo);
  await otherPage.goto(flight);
  await expect(
    otherPage.getByRole("link", { name: /Edit|Correct/ }),
  ).toHaveCount(0);
  await otherPage.goto(`${flight}/edit`);
  await expect(otherPage.getByText("Not allowed")).toBeVisible();
  await other.close();
});

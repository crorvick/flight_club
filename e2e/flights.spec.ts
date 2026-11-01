import { expect, test, type Page } from "@playwright/test";

import {
  approve,
  closeSql,
  createAircraft,
  deleteAircraft,
  newMember,
  signUp,
  sql,
} from "./helpers";

let aircraft: { id: string; tailNumber: string };

test.beforeEach(async ({ page }, testInfo) => {
  aircraft = await createAircraft(
    testInfo,
    { hobbs: "100.00", tach: "80.00" },
    "hobbs",
  );
  const pilot = newMember(testInfo);
  await signUp(page, pilot);
  await expect(page.getByRole("status")).toBeVisible();
  approve(pilot.email, "pilot");
});

test.afterEach(async () => {
  await deleteAircraft(aircraft.id);
});

test.afterAll(async () => {
  await closeSql();
});

async function openLogForm(page: Page) {
  await page.goto(`/flights/new?aircraft=${aircraft.id}`);
  await expect(
    page.getByRole("button", { name: `Log flight in ${aircraft.tailNumber}` }),
  ).toBeVisible();
}

async function logFlight(page: Page, hobbs: string, tach: string) {
  await openLogForm(page);
  await page.getByLabel("Hobbs in").fill(hobbs);
  await page.getByLabel("Tach in").fill(tach);
  await page
    .getByRole("button", { name: `Log flight in ${aircraft.tailNumber}` })
    .click();
  await expect(page.getByText("Flight logged.")).toBeVisible();
}

test("logs a flight from the pre-filled out readings", async ({ page }) => {
  await openLogForm(page);
  await expect(page.getByText("out 100.0")).toBeVisible();
  await expect(page.getByText("out 80.0")).toBeVisible();

  await page.getByLabel("Hobbs in").fill("101.5");
  await expect(page.getByText("1.5 hours")).toBeVisible();
  await page.getByLabel("Tach in").fill("81.2");
  await expect(page.getByText("1.2 hours")).toBeVisible();

  await expect(page.getByLabel("Day landings", { exact: true })).toHaveValue(
    "1",
  );
  await page.getByRole("button", { name: "More day landings" }).click();
  await expect(page.getByLabel("Day landings", { exact: true })).toHaveValue(
    "2",
  );

  await page
    .getByRole("button", { name: `Log flight in ${aircraft.tailNumber}` })
    .click();
  await expect(page.getByText("Flight logged.")).toBeVisible();
  await expect(page.getByText("1.5 hours (hobbs)")).toBeVisible();
  await expect(page.getByText("2 day, 0 night")).toBeVisible();

  // The next flight starts where this one ended.
  await openLogForm(page);
  await expect(page.getByText("out 101.5")).toBeVisible();
  await expect(page.getByText("out 81.2")).toBeVisible();
});

test("rejects an in reading below out and keeps what was typed", async ({
  page,
}) => {
  await openLogForm(page);
  await page.getByLabel("Hobbs in").fill("99.0");
  await page.getByLabel("Tach in").fill("81.0");
  await expect(
    page.getByText("Must be more than the out reading."),
  ).toBeVisible();

  await page
    .getByRole("button", { name: `Log flight in ${aircraft.tailNumber}` })
    .click();
  await expect(
    page.getByText("Must be more than the out reading."),
  ).toBeVisible();
  await expect(page.getByLabel("Hobbs in")).toHaveValue("99.0");
  await expect(page.getByLabel("Tach in")).toHaveValue("81.0");
});

test("warns about a long flight but still logs it", async ({ page }) => {
  await openLogForm(page);
  // A dropped decimal point: 1015 instead of 101.5.
  await page.getByLabel("Hobbs in").fill("1015");
  await expect(page.getByText("Did you mean to log that much?")).toBeVisible();
  await page.getByLabel("Tach in").fill("81.0");
  await page
    .getByRole("button", { name: `Log flight in ${aircraft.tailNumber}` })
    .click();
  await expect(page.getByText("Flight logged.")).toBeVisible();
});

test("rejects a form whose out readings someone else just used", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await openLogForm(page);
  await openLogForm(other);

  await page.getByLabel("Hobbs in").fill("101.5");
  await page.getByLabel("Tach in").fill("81.2");
  await page
    .getByRole("button", { name: `Log flight in ${aircraft.tailNumber}` })
    .click();
  await expect(page.getByText("Flight logged.")).toBeVisible();

  // The second form still shows the old out readings.
  await other.getByLabel("Hobbs in").fill("102.0");
  await other.getByLabel("Tach in").fill("81.6");
  await other
    .getByRole("button", { name: `Log flight in ${aircraft.tailNumber}` })
    .click();
  await expect(
    other.getByText("This aircraft was just updated."),
  ).toBeVisible();
  await expect(other.getByText("out 101.5")).toBeVisible();
  await expect(other.getByLabel("Hobbs in")).toHaveValue("102.0");

  // Submitting again against the new readings works.
  await other
    .getByRole("button", { name: `Log flight in ${aircraft.tailNumber}` })
    .click();
  await expect(other.getByText("Flight logged.")).toBeVisible();
  await expect(other.getByText("0.5 hours (hobbs)")).toBeVisible();
});

test("a flight is editable until the next one is logged", async ({ page }) => {
  await logFlight(page, "101.5", "81.2");
  const firstFlight = page.url().split("?")[0];

  await page.getByRole("link", { name: "Edit flight" }).click();
  await expect(page.getByLabel("Hobbs in")).toHaveValue("101.5");
  await page.getByLabel("Hobbs in").fill("101.8");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Flight updated.")).toBeVisible();
  await expect(page.getByText("1.8 hours (hobbs)")).toBeVisible();

  // The edit moved the meter, so the next flight starts from it.
  await logFlight(page, "102.5", "81.8");

  await page.goto(firstFlight);
  await expect(page.getByText("Locked:")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit flight" })).toHaveCount(0);

  await page.goto(`${firstFlight}/edit`);
  await expect(page.getByText("This flight was locked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
});

test("warns before logging a grounded aircraft", async ({ page }) => {
  const [{ id: pilotId }] = await sql()`select id from member limit 1`;
  await sql()`
    insert into squawk (aircraft_id, reported_by_id, description, grounds)
    values (${aircraft.id}, ${pilotId}, 'Flat nose tire.', true)
  `;

  await openLogForm(page);
  await expect(
    page.getByText(`${aircraft.tailNumber} is grounded`),
  ).toBeVisible();
  await expect(page.getByText("Flat nose tire.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(aircraft.tailNumber) }),
  ).toContainText("Grounded");
});

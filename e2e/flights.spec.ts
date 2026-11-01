import { expect, test, type Page } from "@playwright/test";

import {
  checkIn,
  checkOut,
  closeSql,
  createAircraft,
  createSquawk,
  deleteAircraft,
  logFlight,
  openCheckOut,
  signUpPilot,
  sql,
} from "./helpers";

let aircraft: { id: string; tailNumber: string };

test.beforeEach(async ({ page }, testInfo) => {
  aircraft = await createAircraft(
    testInfo,
    { hobbs: "100.00", tach: "80.00" },
    "hobbs",
  );
  await signUpPilot(page, testInfo);
});

test.afterEach(async () => {
  await deleteAircraft(aircraft.id);
});

test.afterAll(async () => {
  await closeSql();
});

const checkInButton = (page: Page) =>
  page.getByRole("button", { name: `Check in ${aircraft.tailNumber}` });

test("checks out from the current readings and checks in a flight", async ({
  page,
}) => {
  await openCheckOut(page, aircraft);
  await expect(page.getByLabel("Hobbs reads")).toHaveValue("100.0");
  await expect(page.getByLabel("Tach reads")).toHaveValue("80.0");
  await checkOut(page, aircraft);

  // Home now offers to check it back in.
  await page.goto("/");
  await page
    .getByRole("link", { name: `Check in ${aircraft.tailNumber}` })
    .click();

  await expect(page.getByText("out 100.0")).toBeVisible();
  await page.getByLabel("Hobbs in").fill("101.5");
  await expect(page.getByText("1.5 hours")).toBeVisible();
  await page.getByLabel("Tach in").fill("81.2");
  await page.getByLabel("Fuel added (gal)").fill("0");
  await page.getByLabel("Oil added (qt)").fill("0");
  await checkInButton(page).click();

  await expect(page.getByText("Flight logged.")).toBeVisible();
  await expect(page.getByText("1.5 hours (hobbs)")).toBeVisible();

  // The next check-out starts where this flight ended.
  await openCheckOut(page, aircraft);
  await expect(page.getByLabel("Hobbs reads")).toHaveValue("101.5");
  await expect(page.getByLabel("Tach reads")).toHaveValue("81.2");
});

test("cancelling records no flight and frees the aircraft", async ({
  page,
}) => {
  await checkOut(page, aircraft);
  await page.getByRole("button", { name: "Cancel: didn't fly" }).click();
  await expect(
    page.getByText("Cancelled. No flight was recorded."),
  ).toBeVisible();

  const [{ flights }] = await sql()`
    select count(*)::int as flights from flight where aircraft_id = ${aircraft.id}
  `;
  expect(flights).toBe(0);
  await expect(
    page.getByRole("button", { name: `Check out ${aircraft.tailNumber}` }),
  ).toBeVisible();
});

test("a meter reading more than logged is accepted and flagged", async ({
  page,
  browser,
}, testInfo) => {
  await openCheckOut(page, aircraft);
  await page.getByLabel("Hobbs reads").fill("99.0");
  await expect(
    page.getByText("Can't be less than the last logged reading, 100.0."),
  ).toBeVisible();

  await page.getByLabel("Hobbs reads").fill("101.2");
  await expect(
    page.getByText("1.2 hours more than last logged (100.0)."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Check out ${aircraft.tailNumber}` })
    .click();
  await expect(
    page.getByText("Unlogged time found at check-out"),
  ).toBeVisible();
  // The flight starts from what the panel read.
  await expect(page.getByText("out 101.2")).toBeVisible();

  // An officer sees it to account for.
  const context = await browser.newContext();
  const officer = await context.newPage();
  await signUpPilot(officer, testInfo, ["officer"]);
  const unlogged = officer
    .getByRole("region", { name: "Needs attention" })
    .getByRole("link", {
      name: new RegExp(`Unlogged time on ${aircraft.tailNumber}`),
    });
  await officer.goto("/");
  await unlogged.click();
  await officer.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(officer.getByText("Reviewed by an officer.")).toBeVisible();
  await officer.goto("/");
  await expect(unlogged).toHaveCount(0);
  await context.close();
});

test("every open squawk must be acknowledged", async ({ page }) => {
  await createSquawk(aircraft.id, {
    description: "Left fuel gauge reads low.",
    grounds: false,
  });
  await openCheckOut(page, aircraft);
  await expect(page.getByText("Left fuel gauge reads low.")).toBeVisible();
  await page
    .getByRole("button", { name: `Check out ${aircraft.tailNumber}` })
    .click();
  await expect(
    page.getByText("Read and acknowledge every open squawk"),
  ).toBeVisible();

  // One reported while the pilot is on the page must be read too.
  await page.getByRole("checkbox", { name: /Left fuel gauge/ }).check();
  await createSquawk(aircraft.id, {
    description: "Door seal torn.",
    grounds: false,
  });
  await page
    .getByRole("button", { name: `Check out ${aircraft.tailNumber}` })
    .click();
  await expect(
    page.getByText("Read and acknowledge every open squawk"),
  ).toBeVisible();

  await checkOut(page, aircraft);
  await expect(page.getByText("Squawks acknowledged")).toBeVisible();
  await expect(
    page.getByText("Door seal torn.", { exact: true }),
  ).toBeVisible();
});

test("a grounded aircraft can't be checked out", async ({ page }) => {
  await createSquawk(aircraft.id, {
    description: "Flat nose tire.",
    grounds: true,
  });
  await page.goto(`/check-out?aircraft=${aircraft.id}`);
  await expect(
    page.getByText(`${aircraft.tailNumber} is grounded`),
  ).toBeVisible();
  await expect(page.getByText("Flat nose tire.")).toBeVisible();
  await expect(
    page.getByText(/can't be checked out until an officer/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Check out ${aircraft.tailNumber}` }),
  ).toHaveCount(0);
});

test("only one pilot can have an aircraft out", async ({
  page,
  browser,
}, testInfo) => {
  const context = await browser.newContext();
  const other = await context.newPage();
  const otherPilot = await signUpPilot(other, testInfo);

  // Both open the form; the first to submit gets it.
  await openCheckOut(page, aircraft);
  await openCheckOut(other, aircraft);
  await other
    .getByRole("button", { name: `Check out ${aircraft.tailNumber}` })
    .click();
  await expect(
    other.getByRole("heading", { name: `You have ${aircraft.tailNumber}` }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Check out ${aircraft.tailNumber}` })
    .click();
  await expect(
    page.getByText(`Someone else just checked out ${aircraft.tailNumber}.`),
  ).toBeVisible();

  await page.goto(`/check-out?aircraft=${aircraft.id}`);
  await expect(
    page.getByText(
      `${aircraft.tailNumber} is checked out to ${otherPilot.name}.`,
    ),
  ).toBeVisible();
  await context.close();
});

test("check-in rejects an in reading below out and keeps what was typed", async ({
  page,
}) => {
  await checkOut(page, aircraft);
  await page.getByLabel("Hobbs in").fill("99.0");
  await page.getByLabel("Tach in").fill("81.0");
  await expect(
    page.getByText("Must be more than the out reading."),
  ).toBeVisible();
  await checkInButton(page).click();
  await expect(
    page.getByText("Must be more than the out reading."),
  ).toBeVisible();
  await expect(page.getByLabel("Hobbs in")).toHaveValue("99.0");
  await expect(page.getByLabel("Tach in")).toHaveValue("81.0");
});

test("check-in warns about a long flight but still records it", async ({
  page,
}) => {
  await checkOut(page, aircraft);
  // A dropped decimal point: 1015 instead of 101.5.
  await page.getByLabel("Hobbs in").fill("1015");
  await expect(page.getByText("Did you mean to log that much?")).toBeVisible();
  await checkIn(page, aircraft, { Tach: "81.0" });
  await expect(page.getByText("Flight logged.")).toBeVisible();
});

test("a flight is editable until the next one is checked in", async ({
  page,
}) => {
  const first = await logFlight(page, aircraft, {
    Hobbs: "101.5",
    Tach: "81.2",
  });

  await page.getByRole("link", { name: "Edit flight" }).click();
  await expect(page.getByLabel("Hobbs in")).toHaveValue("101.5");
  await page.getByLabel("Hobbs in").fill("101.8");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Flight updated.")).toBeVisible();
  await expect(page.getByText("1.8 hours (hobbs)")).toBeVisible();

  // The edit moved the meter, so the next check-out starts from it.
  await openCheckOut(page, aircraft);
  await expect(page.getByLabel("Hobbs reads")).toHaveValue("101.8");
  await logFlight(page, aircraft, { Hobbs: "102.5", Tach: "81.8" });

  await page.goto(first);
  await expect(page.getByText("Locked:")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit flight" })).toHaveCount(0);
  await page.goto(`${first}/edit`);
  await expect(page.getByText("This flight was locked")).toBeVisible();
});

test("fuel and oil added must be entered, even if none", async ({ page }) => {
  await checkOut(page, aircraft);
  await page.getByLabel("Hobbs in").fill("101.5");
  await page.getByLabel("Tach in").fill("81.2");
  await checkInButton(page).click();
  await expect(
    page.getByText("Enter the fuel added, or 0 if none."),
  ).toBeVisible();
  await expect(
    page.getByText("Enter the oil added, or 0 if none."),
  ).toBeVisible();

  await checkIn(page, aircraft, {});
  await expect(page.getByText("Flight logged.")).toBeVisible();
  await expect(page.getByText("0.0 gal")).toBeVisible();
});

test("check-in records fuel and oil added", async ({ page }) => {
  await checkOut(page, aircraft);
  // No totalizer on this aircraft, so it isn't asked for.
  await expect(page.getByLabel("Totalizer fuel remaining (gal)")).toHaveCount(
    0,
  );
  await checkIn(
    page,
    aircraft,
    { Hobbs: "101.5", Tach: "81.2" },
    { fuel: "18.5", oil: "1" },
  );

  await expect(page.getByText("Flight logged.")).toBeVisible();
  await expect(page.getByText("18.5 gal")).toBeVisible();
  await expect(page.getByText("1.0 qt")).toBeVisible();

  // The pilot can still correct it until the next flight.
  await page.getByRole("link", { name: "Edit flight" }).click();
  await expect(page.getByLabel("Fuel added (gal)")).toHaveValue("18.5");
  await page.getByLabel("Fuel added (gal)").fill("20");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("20.0 gal")).toBeVisible();
});

test("records the totalizer on aircraft that have one", async ({ page }) => {
  await sql()`update aircraft set has_fuel_totalizer = true where id = ${aircraft.id}`;
  await checkOut(page, aircraft);
  // Required when the aircraft has one.
  await checkIn(page, aircraft, { Hobbs: "101.5", Tach: "81.2" });
  await expect(
    page.getByText("Enter the fuel remaining on the totalizer."),
  ).toBeVisible();

  await checkIn(
    page,
    aircraft,
    { Hobbs: "101.5", Tach: "81.2" },
    { totalizer: "300" },
  );
  await expect(page.getByText("That's more than 200 gallons.")).toBeVisible();
  await expect(page.getByLabel("Hobbs in")).toHaveValue("101.5");

  await page.getByLabel("Totalizer fuel remaining (gal)").fill("42.3");
  await checkInButton(page).click();
  await expect(page.getByText("Flight logged.")).toBeVisible();
  await expect(page.getByText("42.3 gal remaining")).toBeVisible();
});

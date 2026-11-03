import { expect, test, type Page } from "@playwright/test";

import {
  addFluid,
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
  await page
    .getByRole("button", { name: "Didn't fly? Cancel check-out" })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel check-out" })
    .click();
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

test("fuel and oil are added while out and totalled at check-in", async ({
  page,
}) => {
  await checkOut(page, aircraft);
  await expect(page.getByText("No fuel or oil added.")).toBeVisible();
  // No totalizer on this aircraft, so it isn't asked for.
  await expect(page.getByLabel(/Totalizer/)).toHaveCount(0);

  await page.getByRole("button", { name: "Add fuel or oil" }).click();
  await expect(page.getByText("Enter the fuel or oil added.")).toBeVisible();

  await addFluid(page, { "Fuel added (gal)": "18.5" });
  await addFluid(page, { "Fuel added (gal)": "5", "Oil added (qt)": "1" });
  await expect(
    page.getByText("23.5 gal fuel, 1.0 qt oil added."),
  ).toBeVisible();
  // A typo is removed and added again.
  await page
    .getByRole("button", { name: "Remove 5.0 gal fuel · 1.0 qt oil" })
    .click();
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(1);
  await addFluid(page, { "Oil added (qt)": "1" });
  await expect(
    page.getByText("18.5 gal fuel, 1.0 qt oil added."),
  ).toBeVisible();

  await checkIn(page, aircraft, { Hobbs: "101.5", Tach: "81.2" });
  await expect(page.getByText("Flight logged.")).toBeVisible();
  await expect(page.getByText("18.5 gal", { exact: true })).toBeVisible();
  await expect(page.getByText("1.0 qt", { exact: true })).toBeVisible();

  // The pilot can still correct the totals until the next flight.
  await page.getByRole("link", { name: "Edit flight" }).click();
  await expect(
    page.getByRole("textbox", { name: "Fuel added (gal)" }),
  ).toHaveValue("18.5");
  await page.getByRole("textbox", { name: "Fuel added (gal)" }).fill("20");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("20.0 gal", { exact: true })).toBeVisible();
});

test("a flight with nothing added records none", async ({ page }) => {
  await logFlight(page, aircraft, { Hobbs: "101.5", Tach: "81.2" });
  await expect(page.getByText("0.0 gal", { exact: true })).toBeVisible();
  await expect(page.getByText("0.0 qt", { exact: true })).toBeVisible();
});

test("counts fuel used on the totalizer across resets", async ({ page }) => {
  await sql()`update aircraft set fuel_totalizers = 1 where id = ${aircraft.id}`;

  // Confirmed at check-out; nothing to start from on a first flight.
  await openCheckOut(page, aircraft);
  const out = page.getByRole("textbox", {
    name: "Totalizer fuel remaining (gal)",
  });
  await expect(out).toHaveValue("");
  await page
    .getByRole("button", { name: `Check out ${aircraft.tailNumber}` })
    .click();
  await expect(
    page.getByText("Enter the fuel remaining it shows."),
  ).toBeVisible();
  await out.fill("30");
  await page
    .getByRole("button", { name: `Check out ${aircraft.tailNumber}` })
    .click();
  await expect(
    page.getByRole("heading", { name: `You have ${aircraft.tailNumber}` }),
  ).toBeVisible();

  // Fueling asks what it showed and what it was reset to, and catches a
  // reading higher than it can be.
  await page.getByRole("textbox", { name: "Fuel added (gal)" }).fill("20");
  await page.getByRole("button", { name: "Add fuel or oil" }).click();
  await expect(
    page.getByText("Enter what it showed before fueling."),
  ).toBeVisible();
  await expect(page.getByText("Enter what you reset it to.")).toBeVisible();
  await page.getByLabel("Totalizer before fueling (gal)").fill("35");
  await page.getByLabel("Totalizer reset to (gal)").fill("45");
  await page.getByRole("button", { name: "Add fuel or oil" }).click();
  await expect(
    page.getByText(
      "It showed 30.0 gal at check-out, so it can't show more now.",
    ),
  ).toBeVisible();
  await addFluid(page, {
    "Totalizer before fueling (gal)": "25",
    "Totalizer reset to (gal)": "45",
  });
  await expect(
    page.getByText("The totalizer should show 45.0 gal or less."),
  ).toBeVisible();

  await page.getByLabel("Hobbs in").fill("101.5");
  await page.getByLabel("Tach in").fill("81.2");
  await page
    .getByRole("textbox", { name: "Totalizer fuel remaining (gal)" })
    .fill("300");
  await checkInButton(page).click();
  await expect(page.getByText("That's more than 200 gallons.")).toBeVisible();
  await expect(page.getByLabel("Hobbs in")).toHaveValue("101.5");
  await page
    .getByRole("textbox", { name: "Totalizer fuel remaining (gal)" })
    .fill("50");
  await checkInButton(page).click();
  await expect(
    page.getByText(
      "It showed 45.0 gal after the last reset, so it can't show more now.",
    ),
  ).toBeVisible();

  await page
    .getByRole("textbox", { name: "Totalizer fuel remaining (gal)" })
    .fill("33.5");
  await checkInButton(page).click();
  await expect(page.getByText("Flight logged.")).toBeVisible();
  await expect(page.getByText("33.5 gal remaining")).toBeVisible();
  // 30.0 down to 25.0, then 45.0 down to 33.5.
  await expect(page.getByText("16.5 gal", { exact: true })).toBeVisible();

  // The next check-out starts from where it ended.
  await openCheckOut(page, aircraft);
  await expect(out).toHaveValue("33.5");
});

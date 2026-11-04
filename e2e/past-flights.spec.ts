import { expect, type Page, test } from "./fixtures";

import {
  closeSql,
  createAircraft,
  deleteAircraft,
  logFlight,
  openCheckOut,
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

async function fillPastFlight(
  page: Page,
  flight: {
    pilot: string;
    hobbs: [string, string];
    tach: [string, string];
    date: string;
  },
) {
  await page
    .getByLabel("Pilot", { exact: true })
    .selectOption({ label: flight.pilot });
  await page.getByLabel("Hobbs out").fill(flight.hobbs[0]);
  await page.getByLabel("Hobbs in").fill(flight.hobbs[1]);
  await page.getByLabel("Tach out").fill(flight.tach[0]);
  await page.getByLabel("Tach in").fill(flight.tach[1]);
  await page.getByLabel("Fuel added (gal)").fill("0");
  await page.getByLabel("Oil added (qt)").fill("0");
  await page.getByLabel("Date").fill(flight.date);
}

test("an officer adds a missed flight, which moves the meters on", async ({
  page,
}, testInfo) => {
  const officer = await signUpPilot(page, testInfo, ["officer", "pilot"]);
  await page.goto(`/aircraft/${aircraft.id}`);
  await page.getByRole("link", { name: "Flights" }).click();
  await expect(page.getByText("No flights logged yet.")).toBeVisible();
  await page.getByRole("link", { name: "Add a past flight" }).click();

  await fillPastFlight(page, {
    pilot: officer.name,
    hobbs: ["100.0", "101.5"],
    tach: ["80.0", "81.2"],
    date: "2026-10-20",
  });
  await page.getByRole("button", { name: "Add flight" }).click();
  await expect(
    page.getByText("Say where the flight comes from, e.g. the paper log."),
  ).toBeVisible();
  await page.getByLabel("Where it comes from").fill("Paper log, page 12.");
  await page.getByRole("button", { name: "Add flight" }).click();
  await expect(page.getByText("Flight added.")).toBeVisible();
  await expect(page.getByText("1.5 hours (hobbs)")).toBeVisible();

  // It started where the meters stood, so it's the latest flight.
  await openCheckOut(page, aircraft);
  await expect(page.getByLabel("Hobbs reads")).toHaveValue("101.5");

  const [entry] = await sql()`
    select a.action, a.after from audit_log a
    join flight f on f.id = a.entity_id
    where f.aircraft_id = ${aircraft.id}
  `;
  expect(entry).toMatchObject({
    action: "flight.create",
    after: { reason: "Paper log, page 12.", latest: true },
  });
});

test("a plane captain adds and corrects an earlier flight on their aircraft", async ({
  page,
}, testInfo) => {
  const captain = await signUpPilot(page, testInfo);
  await sql()`
    insert into aircraft_captain (aircraft_id, member_id)
    select ${aircraft.id}, id from member where email = ${captain.email}
  `;
  await logFlight(page, aircraft, { Hobbs: "101.5", Tach: "81.2" });

  // From before the flight just logged: history, which leaves the meters.
  await page.goto("/fleet");
  await page
    .getByRole("region", { name: aircraft.tailNumber })
    .getByRole("link", { name: "Flights" })
    .click();
  await page.getByRole("link", { name: "Add a past flight" }).click();
  await fillPastFlight(page, {
    pilot: captain.name,
    hobbs: ["90.0", "92.0"],
    tach: ["70.0", "71.6"],
    date: "2026-09-01",
  });
  await page.getByLabel("Where it comes from").fill("Found in the paper log.");
  await page.getByRole("button", { name: "Add flight" }).click();
  await expect(page.getByText("Flight added.")).toBeVisible();
  await expect(page.getByText("Locked:")).toBeVisible();

  await page
    .getByRole("link", { name: "Correct flight (plane captain)" })
    .click();
  // By role, which skips hidden elements: the add form is still in the
  // page, hidden, for going back to it.
  await page.getByRole("textbox", { name: "Hobbs in" }).fill("92.5");
  await page
    .getByRole("textbox", { name: "Reason for the correction" })
    .fill("Misread the paper log.");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("Flight corrected.")).toBeVisible();
  await expect(page.getByText("2.5 hours (hobbs)")).toBeVisible();

  await openCheckOut(page, aircraft);
  await expect(page.getByLabel("Hobbs reads")).toHaveValue("101.5");
});

test("a captain can't add flights to an aircraft they don't look after", async ({
  page,
}, testInfo) => {
  await signUpPilot(page, testInfo);
  await page.goto(`/aircraft/${aircraft.id}/flights/new`);
  await expect(page.getByText("Not allowed")).toBeVisible();
  await page.goto(`/aircraft/${aircraft.id}/flights`);
  await expect(page.getByText("Not allowed")).toBeVisible();
});

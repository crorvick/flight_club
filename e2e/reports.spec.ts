import { expect, type Page, test } from "@playwright/test";

import {
  closeSql,
  createAircraft,
  createSquawk,
  deleteAircraft,
  logFlight,
  signUpPilot,
  sql,
} from "./helpers";

let aircraft: { id: string; tailNumber: string };

test.beforeEach(async ({}, testInfo) => {
  aircraft = await createAircraft(
    testInfo,
    { hobbs: "500.00", tach: "400.00" },
    "hobbs",
  );
});

test.afterEach(async () => {
  await sql()`
    delete from maintenance_completion where item_id in (
      select id from maintenance_item where aircraft_id = ${aircraft.id}
    )
  `;
  await deleteAircraft(aircraft.id);
});

test.afterAll(async () => {
  await closeSql();
});

// An item of the kind, done on the date at the tach reading, logged.
async function logged(
  kind: "annual" | "oil_change",
  completedOn: string,
  reading: string,
  details: object | null,
) {
  const [item] = await sql()`
    insert into maintenance_item (
      aircraft_id, name, kind, interval_months, last_completed_on
    )
    values (${aircraft.id}, ${kind}, ${kind}, 12, ${completedOn})
    returning id
  `;
  await sql()`
    insert into maintenance_completion (item_id, completed_on, reading, details)
    values (${item.id}, ${completedOn}, ${reading}, ${details ? sql().json(details as never) : null})
  `;
}

const report = (page: Page, path: string) =>
  page.goto(`${path}?aircraft=${aircraft.id}`);

test("the oil report sums what was added since the last change", async ({
  page,
}, testInfo) => {
  await signUpPilot(page, testInfo, ["officer", "pilot"]);
  await logged("oil_change", "2026-10-01", "400.00", {
    kind: "oil_change",
    quarts: ["7.0"],
    oilType: "AeroShell W100",
    filterReplaced: true,
    sampleSent: false,
  });
  await logFlight(
    page,
    aircraft,
    { Hobbs: "501.5", Tach: "401.2" },
    { oil: "1" },
  );
  await logFlight(
    page,
    aircraft,
    { Hobbs: "503.0", Tach: "402.5" },
    { oil: "0.5" },
  );

  await page.goto("/reports");
  await page.getByRole("link", { name: /^Oil/ }).click();
  await page.getByLabel("Aircraft").selectOption({ value: aircraft.id });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByRole("heading", { name: "Oil report" })).toBeVisible();
  const current = page.getByRole("region", { name: "Current oil" });
  await expect(current).toContainText("AeroShell W100");
  await expect(current).toContainText("2.5 h");
  await expect(current).toContainText("1.5 qt");
  await expect(page.getByRole("button", { name: "Save as PDF" })).toBeVisible();
});

test("the mechanic's report covers squawks since the annual", async ({
  page,
}, testInfo) => {
  await signUpPilot(page, testInfo, ["officer"]);
  await logged("annual", "2026-01-15", "380.00", null);
  await createSquawk(aircraft.id, {
    description: "Left brake soft.",
    grounds: false,
  });

  await report(page, "/reports/mechanic");
  await expect(page.getByText("Last annual")).toBeVisible();
  await expect(page.getByText("Jan 15, 2026 at 380.0")).toBeVisible();
  await expect(page.getByText("20.0 h (tach)")).toBeVisible();
  await expect(page.getByText("Left brake soft.")).toBeVisible();
});

test("the flight report shows who flew what", async ({ page }, testInfo) => {
  const me = await signUpPilot(page, testInfo, ["officer", "pilot"]);
  await logFlight(page, aircraft, { Hobbs: "501.5", Tach: "401.2" });

  await page.goto(`/reports/flights?aircraft=${aircraft.id}`);
  const byPilot = page.getByRole("region", { name: "By pilot" });
  await expect(byPilot).toContainText(me.name);
  await expect(byPilot).toContainText(`${aircraft.tailNumber} 1.5`);

  // Billed by the Hobbs; the tach ran 1.2.
  await page.getByLabel("Hours from").selectOption("Tach");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText("tach hours")).toBeVisible();
  await expect(byPilot).toContainText(`${aircraft.tailNumber} 1.2`);
  await expect(page.getByLabel("Hours from").getByRole("option")).toHaveText([
    "Billing meter",
    "Hobbs",
    "Tach",
  ]);
});

test("captains see only their aircraft; pilots get no reports", async ({
  page,
}, testInfo) => {
  const captain = await signUpPilot(page, testInfo);
  await page.goto("/reports");
  await expect(page.getByText("Not allowed")).toBeVisible();

  await sql()`
    insert into aircraft_captain (aircraft_id, member_id)
    select ${aircraft.id}, id from member where email = ${captain.email}
  `;
  await page.goto("/reports/flights");
  await expect(page.getByLabel("Aircraft").getByRole("option")).toHaveText([
    "All aircraft",
    aircraft.tailNumber,
  ]);
});

test("reports are offered on tablets and desktops, not phones", async ({
  page,
}, testInfo) => {
  await signUpPilot(page, testInfo, ["officer", "pilot"]);
  await page.goto("/manage");
  const reports = page.getByRole("link", { name: /^Reports/ });
  const phone = ["iphone", "android"].includes(testInfo.project.name);
  if (phone) await expect(reports).toHaveCount(0);
  else await expect(reports).toBeVisible();
});

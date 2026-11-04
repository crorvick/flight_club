import { expect, test } from "@playwright/test";

import {
  closeSql,
  createAircraft,
  createSquawk,
  deleteAircraft,
  signUpPilot,
} from "./helpers";

let mine: { id: string; tailNumber: string };
let other: { id: string; tailNumber: string };

test.beforeEach(async ({}, testInfo) => {
  mine = await createAircraft(testInfo, { tach: "50.00" }, "tach");
  other = await createAircraft(testInfo, { tach: "70.00" }, "tach");
});

test.afterEach(async () => {
  await deleteAircraft(mine.id);
  await deleteAircraft(other.id);
});

test.afterAll(async () => {
  await closeSql();
});

test("a plane captain manages their own aircraft's squawks and maintenance", async ({
  page,
  browser,
}, testInfo) => {
  // The captain, a pilot, in a browser of their own.
  const context = await browser.newContext();
  const captainPage = await context.newPage();
  const captain = await signUpPilot(captainPage, testInfo);

  // An officer makes them captain of one aircraft.
  await signUpPilot(page, testInfo, ["officer", "pilot"]);
  await page.goto(`/aircraft/${mine.id}`);
  await page.getByLabel("Add a captain").selectOption({ label: captain.name });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Plane captains saved.")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Plane captains" }),
  ).toContainText(captain.name);

  // They resolve a grounding squawk on it...
  const grounding = await createSquawk(mine.id, {
    description: "Nose strut flat.",
    grounds: true,
  });
  await captainPage.goto(`/squawks/${grounding}`);
  await expect(
    captainPage.getByRole("heading", { name: "Plane captain" }),
  ).toBeVisible();
  await captainPage
    .getByLabel("What was done about it?")
    .fill("Serviced the strut.");
  await captainPage
    .getByRole("button", { name: "Resolve and return to service" })
    .click();
  await expect(captainPage.getByText("Squawk resolved.")).toBeVisible();

  // ...and add a maintenance item to it, from the fleet page.
  await captainPage.goto("/fleet");
  await captainPage
    .getByRole("region", { name: mine.tailNumber })
    .getByRole("link", { name: "Maintenance" })
    .click();
  await captainPage.getByLabel("Name").fill("Oil change");
  await captainPage.getByLabel("Hours", { exact: true }).fill("50");
  await captainPage.getByLabel("Last done on").fill("2026-10-01");
  await captainPage.getByLabel("Logbook reading").fill("40.0");
  await captainPage.getByLabel(/Only warn/).check();
  await captainPage.getByRole("button", { name: "Add item" }).click();
  await expect(captainPage.getByText("Item added.")).toBeVisible();

  // Nothing of the sort on an aircraft they don't look after.
  await expect(
    captainPage
      .getByRole("region", { name: other.tailNumber })
      .getByRole("link", { name: "Maintenance" }),
  ).toHaveCount(0);
  await captainPage.goto(`/aircraft/${other.id}/maintenance`);
  await expect(captainPage.getByText("Not allowed")).toBeVisible();
  const elsewhere = await createSquawk(other.id, {
    description: "Cabin light flickers.",
    grounds: false,
  });
  await captainPage.goto(`/squawks/${elsewhere}`);
  await expect(captainPage.getByText("Cabin light flickers.")).toBeVisible();
  await expect(
    captainPage.getByRole("heading", { name: "Plane captain" }),
  ).toHaveCount(0);

  // Nor the officer pages.
  await captainPage.goto(`/aircraft/${mine.id}`);
  await expect(captainPage.getByText("Not allowed")).toBeVisible();

  // Once removed, they're back to being a pilot.
  await page.goto(`/aircraft/${mine.id}`);
  await page
    .getByRole("button", { name: `Remove ${captain.name} as captain` })
    .click();
  await expect(page.getByText("Plane captains saved.")).toBeVisible();
  await captainPage.goto(`/aircraft/${mine.id}/maintenance`);
  await expect(captainPage.getByText("Not allowed")).toBeVisible();

  await context.close();
});

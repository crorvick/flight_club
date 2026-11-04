import { expect, test, type Page } from "./fixtures";

import { formatDate } from "../src/lib/dates";
import {
  closeSql,
  createAircraft,
  deleteAircraft,
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

function isoFromToday(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const warnings = (page: Page) =>
  page.locator("div", { hasText: /^Before you fly/ });

const openLog = (page: Page) => openCheckOut(page, aircraft);

test("a new pilot is told what's missing, and keeps it up to date", async ({
  page,
}, testInfo) => {
  await signUpPilot(page, testInfo);
  await openLog(page);
  const box = warnings(page);
  await expect(box).toContainText("No medical on file.");
  await expect(box).toContainText("No flight review on file.");
  await expect(box).toContainText("You're not checked out in this aircraft.");

  await page.goto("/qualifications");
  await page.getByLabel("Medical", { exact: true }).selectOption("Third class");
  await page.getByLabel("Medical expires").fill(isoFromToday(365));
  await page.getByLabel("Last flight review").fill(isoFromToday(-30));
  await page.getByRole("button", { name: "Save qualifications" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByText(/Flight review good through/)).toBeVisible();
  // Pilots can't record their own checkouts.
  await expect(
    page.getByRole("button", { name: "Record checkout" }),
  ).toHaveCount(0);

  await openLog(page);
  await expect(box).not.toContainText("medical");
  await expect(box).not.toContainText("flight review");
});

test("an expired medical is flagged as serious", async ({ page }, testInfo) => {
  await signUpPilot(page, testInfo);
  await page.goto("/qualifications");
  await page.getByLabel("Medical", { exact: true }).selectOption("Third class");
  const expired = isoFromToday(-3);
  await page.getByLabel("Medical expires").fill(expired);
  await page.getByRole("button", { name: "Save qualifications" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await openLog(page);
  await expect(warnings(page)).toContainText(
    `Your medical expired on ${formatDate(expired)}.`,
  );
});

test("an officer records a checkout, which clears the warning", async ({
  page,
  browser,
}, testInfo) => {
  const pilot = await signUpPilot(page, testInfo);
  const [{ id }] =
    await sql()`select id from member where email = ${pilot.email}`;

  const context = await browser.newContext();
  const officer = await context.newPage();
  await signUpPilot(officer, testInfo, ["officer"]);
  await officer.goto(`/members/${id}`);
  await officer.getByLabel("Checked out in").selectOption(aircraft.tailNumber);
  await officer.getByLabel("On", { exact: true }).fill(isoFromToday(-1));
  await officer.getByRole("button", { name: "Record checkout" }).click();
  await expect(officer.getByText("Saved.")).toBeVisible();
  await expect(
    officer.getByRole("listitem").filter({ hasText: aircraft.tailNumber }),
  ).toContainText("since");

  await openLog(page);
  await expect(warnings(page)).not.toContainText("not checked out");

  await officer
    .getByRole("button", { name: `Remove checkout in ${aircraft.tailNumber}` })
    .click();
  await expect(
    officer.getByRole("button", {
      name: `Remove checkout in ${aircraft.tailNumber}`,
    }),
  ).toHaveCount(0);
  await openLog(page);
  await expect(warnings(page)).toContainText("not checked out");
  await context.close();
});

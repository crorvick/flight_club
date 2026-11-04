import { expect, type Page, test } from "./fixtures";

import {
  closeSql,
  createAircraft,
  deleteAircraft,
  signUpPilot,
  sql,
} from "./helpers";

let aircraft: { id: string; tailNumber: string };

// Hours count on the tach, which reads 400.0.
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

async function newItem(page: Page, kind: string) {
  await page.goto(`/aircraft/${aircraft.id}/maintenance`);
  await page.getByLabel("Kind").selectOption({ label: kind });
}

const add = async (page: Page) => {
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Item added.")).toBeVisible();
};

const logCompletion = (page: Page) =>
  page.getByRole("button", { name: "Log completion" }).click();

const mechanicReport = (page: Page) =>
  page.goto(`/reports/mechanic?aircraft=${aircraft.id}`);

const directives = (page: Page) =>
  page.getByRole("region", {
    name: "Airworthiness directives and service bulletins",
  });

test("a one-time AD is complied with for good", async ({ page }) => {
  await newItem(page, "Airworthiness directive");
  await page.getByLabel("AD number").fill("2026-04-11");
  await page.getByLabel("Applies to").selectOption("engine");
  await page.getByLabel("Subject (optional)").fill("Oil filter adapter");
  // Done once by default, and it grounds.
  await expect(page.getByRole("radio", { name: /^Once/ })).toBeChecked();
  await expect(
    page.getByRole("radio", { name: /^Ground the aircraft/ }),
  ).toBeChecked();
  await page.getByLabel("Due at (logbook)").fill("425");
  await add(page);

  await expect(
    page.getByRole("heading", { name: "AD 2026-04-11: Oil filter adapter" }),
  ).toBeVisible();
  await expect(
    page.getByText("Airworthiness directive · Engine"),
  ).toBeVisible();
  await expect(
    page.getByText("due at 425.0 on the tach (25.0 hours left)"),
  ).toBeVisible();

  await logCompletion(page);
  await expect(
    page.getByText(
      "Enter how it was complied with, e.g. inspected per paragraph (g).",
    ),
  ).toBeVisible();
  await page
    .getByLabel("Method of compliance")
    .fill("Replaced the adapter per paragraph (f)");
  await logCompletion(page);
  await expect(page.getByText("Completion logged.")).toBeVisible();
  await expect(page.getByText("Done for good")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Log completion" }),
  ).toHaveCount(0);

  await mechanicReport(page);
  const row = directives(page).getByRole("row", { name: /AD 2026-04-11/ });
  await expect(row).toContainText("Oil filter adapter");
  await expect(row).toContainText("Engine");
  await expect(row).toContainText("Complied with");
  await expect(row).toContainText("Replaced the adapter per paragraph (f)");
});

test("a recurring AD ends with its terminating action", async ({ page }) => {
  await newItem(page, "Airworthiness directive");
  await page.getByLabel("AD number").fill("2026-05-02");
  await page.getByLabel("Applies to").selectOption("airframe");
  await page.getByRole("radio", { name: /^Again and again/ }).check();
  await page.getByLabel("Hours", { exact: true }).fill("100");
  await page.getByLabel("Last done on").fill("2026-09-01");
  await page.getByLabel("Logbook reading").fill("350");
  await add(page);
  await expect(page.getByText("due at 450.0 on the tach")).toBeVisible();

  await page.getByLabel("Method of compliance").fill("Inspected; no cracks");
  await logCompletion(page);
  await expect(page.getByText("Completion logged.")).toBeVisible();
  await expect(page.getByText("due at 500.0 on the tach")).toBeVisible();

  await page
    .getByLabel("Method of compliance")
    .fill("Installed the new spar cap");
  await page.getByLabel(/The terminating action/).check();
  await logCompletion(page);
  await expect(page.getByText("Completion logged.")).toBeVisible();
  await expect(page.getByText("Done for good")).toBeVisible();
  await expect(
    page.getByText("Installed the new spar cap; terminating action"),
  ).toBeVisible();
});

test("an SB that doesn't apply is recorded with why", async ({ page }) => {
  await newItem(page, "Service bulletin");
  await page.getByLabel("Bulletin", { exact: true }).fill("Lycoming SB 632B");
  await page.getByLabel("Applies to").selectOption("engine");
  await page.getByLabel("Doesn't apply to this aircraft").check();
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Say why")).toBeVisible();

  await page.getByLabel("Why not").fill("Engine serial not in range");
  await add(page);
  await expect(page.getByText(/^Not applicable/)).toBeVisible();
  await expect(page.getByText("Engine serial not in range")).toBeVisible();

  await page.goto(`/aircraft/${aircraft.id}/maintenance`);
  await expect(
    page.getByRole("heading", { name: "Done and not applicable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Lycoming SB 632B Not applicable/ }),
  ).toBeVisible();

  await mechanicReport(page);
  const row = directives(page).getByRole("row", { name: /Lycoming SB 632B/ });
  await expect(row).toContainText("Not applicable");
  await expect(row).toContainText("Engine serial not in range");
});

test("an item that expires is renewed with a new date", async ({ page }) => {
  await newItem(page, "General");
  await page.getByLabel("Name").fill("ELT battery");
  await page.getByRole("radio", { name: /^When it expires/ }).check();
  await page.getByLabel("Expires on").fill("2026-01-31");
  await add(page);
  await expect(
    page.getByText("Overdue: the aircraft is grounded"),
  ).toBeVisible();

  await logCompletion(page);
  await expect(page.getByText("Enter the new expiration date.")).toBeVisible();
  await page.getByLabel("New expiration date").fill("2031-01-31");
  await logCompletion(page);
  await expect(page.getByText("Completion logged.")).toBeVisible();
  await expect(page.getByText("Not due yet")).toBeVisible();
  await expect(page.getByText("due Jan 31, 2031")).toBeVisible();
  await expect(page.getByText("Expires Jan 31, 2031")).toBeVisible();
});

test("an out-of-date navigation database rules out IFR", async ({ page }) => {
  await newItem(page, "Navigation database");
  await expect(
    page.getByRole("radio", { name: /^Ground it for IFR only/ }),
  ).toBeChecked();
  // The last cycle, which has run out.
  await page.getByLabel("Installed cycle").selectOption({ index: 0 });
  await add(page);
  await expect(
    page.getByText("Overdue: the aircraft is VFR only"),
  ).toBeVisible();

  await page.getByLabel("Cycle installed").selectOption({ index: 1 });
  await logCompletion(page);
  await expect(page.getByText("Completion logged.")).toBeVisible();
  await expect(page.getByText(/^Cycle \d{4}$/)).toBeVisible();
  await expect(page.getByText(/Overdue/)).toHaveCount(0);
});

test("a 100-hour flown over counts the next from when it was due", async ({
  page,
}) => {
  await newItem(page, "100-hour inspection");
  await expect(page.getByLabel("Hours", { exact: true })).toHaveCount(0);
  await page.getByLabel("Last done on").fill("2026-08-01");
  await page.getByLabel("Logbook reading").fill("295");
  await add(page);
  await expect(page.getByText("5.0 hours overdue on the tach")).toBeVisible();
  await expect(
    page.getByText("It may be flown up to 10 hours over only to reach a place"),
  ).toBeVisible();

  // Done now, at 400.0: five hours late, so the next is due at 495.0.
  await expect(page.getByLabel("Tach reading")).toHaveValue("400.0");
  await logCompletion(page);
  await expect(page.getByText("Completion logged.")).toBeVisible();
  await expect(
    page.getByText("due at 495.0 on the tach (95.0 hours left)"),
  ).toBeVisible();
  const [item] = await sql()`
    select last_completed_reading from maintenance_item
    where aircraft_id = ${aircraft.id}
  `;
  expect(item.last_completed_reading).toBe("395.00");
});

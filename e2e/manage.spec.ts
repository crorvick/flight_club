import { expect, type Page, test } from "./fixtures";

import {
  closeSql,
  createAircraft,
  deleteAircraft,
  signUpPilot,
  sql,
} from "./helpers";

let aircraft: { id: string; tailNumber: string };

test.beforeEach(async ({}, testInfo) => {
  aircraft = await createAircraft(testInfo, { tach: "50.00" }, "tach");
});

test.afterEach(async () => {
  await deleteAircraft(aircraft.id);
});

test.afterAll(async () => {
  await closeSql();
});

// Manage is a menu in the header, and a tab leading to a page of the
// same links where the tab bar shows instead.
async function openManage(page: Page) {
  // The header nav shows from Tailwind's md breakpoint.
  if (page.viewportSize()!.width >= 768) {
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name: /Manage/ })
      .click();
  } else {
    await page
      .getByRole("navigation", { name: "Tabs" })
      .getByRole("link", { name: "Manage" })
      .click();
    await expect(page.getByRole("heading", { name: "Manage" })).toBeVisible();
  }
}

test("officers manage aircraft and members from Manage", async ({
  page,
}, testInfo) => {
  await signUpPilot(page, testInfo, ["officer", "pilot"]);
  await page.goto("/");
  // Pilots keep their profile alongside it.
  await expect(
    page.getByRole("link", { name: "Profile" }).filter({ visible: true }),
  ).toBeVisible();

  await openManage(page);
  await page.getByRole("link", { name: /^Aircraft/ }).click();
  await expect(page.getByRole("heading", { name: "Aircraft" })).toBeVisible();

  await openManage(page);
  await page.getByRole("link", { name: /^Members/ }).click();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
});

test("a plane captain reaches their aircraft from Manage", async ({
  page,
}, testInfo) => {
  const captain = await signUpPilot(page, testInfo);
  await sql()`
    insert into aircraft_captain (aircraft_id, member_id)
    select ${aircraft.id}, id from member where email = ${captain.email}
  `;
  await page.goto("/");
  await openManage(page);
  // No officer pages.
  await expect(page.getByRole("link", { name: /^Members/ })).toHaveCount(0);
  await page
    .getByRole("link", { name: `${aircraft.tailNumber} maintenance` })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/aircraft/${aircraft.id}/maintenance`),
  );
});

test("pilots have nothing to manage", async ({ page }, testInfo) => {
  await signUpPilot(page, testInfo);
  await page.goto("/");
  await expect(page.getByText("Manage", { exact: true })).toHaveCount(0);
  await page.goto("/manage");
  await expect(page.getByText("Not allowed")).toBeVisible();
});

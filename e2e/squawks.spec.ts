import { expect, test, type Page } from "@playwright/test";

import {
  checkIn,
  checkOut,
  closeSql,
  createAircraft,
  deleteAircraft,
  signUpPilot,
} from "./helpers";

// A 1×1 PNG, standing in for a photo from the camera.
const PHOTO = {
  name: "squawk.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
    "base64",
  ),
};

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

const submitButton = (page: Page) =>
  page.getByRole("button", {
    name: `Report squawk on ${aircraft.tailNumber}`,
  });

async function openSquawkForm(page: Page) {
  await page.goto(`/squawks/new?aircraft=${aircraft.id}`);
  await expect(submitButton(page)).toBeVisible();
}

async function attachPhoto(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(page.getByAltText("Photo 1")).toBeVisible();
}

test("a grounding squawk with a photo grounds the aircraft", async ({
  page,
  browser,
}) => {
  await openSquawkForm(page);
  await page.getByText("Yes, grounded").click();
  await page.getByLabel("What's wrong?").fill("Oil leak at the front seal.");
  await page.getByText("Engine", { exact: true }).click();
  await attachPhoto(page);
  await submitButton(page).click();

  await expect(page.getByText("Squawk reported.")).toBeVisible();
  await expect(
    page.getByText(`${aircraft.tailNumber} is grounded.`),
  ).toBeVisible();
  await expect(page.getByText("Oil leak at the front seal.")).toBeVisible();

  // The photo was stored and comes back for a member...
  const photo = page.getByAltText("Photo 1 of the squawk");
  await expect(photo).toHaveJSProperty("complete", true);
  expect(
    await photo.evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBe(1);

  // ...but not for someone signed out.
  const src = await photo.getAttribute("src");
  const stranger = await browser.newContext();
  const response = await stranger.request.get(new URL(src!, page.url()).href);
  expect(response.status()).toBe(401);
  await stranger.close();

  // Checking out now shows it, and refuses.
  await page.goto(`/check-out?aircraft=${aircraft.id}`);
  await expect(
    page.getByText(`${aircraft.tailNumber} is grounded`),
  ).toBeVisible();
  await expect(page.getByText("Oil leak at the front seal.")).toBeVisible();
});

test("a squawk that doesn't ground leaves the aircraft airworthy", async ({
  page,
}) => {
  await openSquawkForm(page);
  await page.getByText("No, still flyable").click();
  await page.getByLabel("What's wrong?").fill("Passenger seat belt frayed.");
  await submitButton(page).click();

  await expect(page.getByText("Squawk reported.")).toBeVisible();
  await expect(
    page.getByText(`${aircraft.tailNumber} is still airworthy.`),
  ).toBeVisible();
});

test("a rejected report keeps the photos and description", async ({ page }) => {
  await openSquawkForm(page);
  await page.getByLabel("What's wrong?").fill("Cracked wheel fairing.");
  await attachPhoto(page);
  await submitButton(page).click();

  await expect(
    page.getByText("Answer whether this grounds the airplane."),
  ).toBeVisible();
  await expect(page.getByLabel("What's wrong?")).toHaveValue(
    "Cracked wheel fairing.",
  );
  await expect(page.getByAltText("Photo 1")).toBeVisible();

  await page.getByText("No, still flyable").click();
  await submitButton(page).click();
  await expect(page.getByText("Squawk reported.")).toBeVisible();
  await expect(page.getByAltText("Photo 1 of the squawk")).toBeVisible();
});

test("checking in can continue into a squawk", async ({ page }) => {
  await checkOut(page, aircraft);
  await page.getByLabel("Report a squawk after logging").check();
  await checkIn(page, aircraft, { Hobbs: "101.0", Tach: "80.8" });

  await expect(page.getByText("Flight logged.")).toBeVisible();
  // The aircraft is already chosen.
  await expect(page.getByRole("navigation", { name: "Aircraft" })).toHaveCount(
    0,
  );
  await page.getByText("No, still flyable").click();
  await page.getByLabel("What's wrong?").fill("Landing light out.");
  await submitButton(page).click();
  await expect(page.getByText("Squawk reported.")).toBeVisible();
});

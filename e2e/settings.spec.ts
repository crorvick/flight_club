import { expect, type Page, test } from "@playwright/test";

import { closeSql, signOut, signUpPilot, sql } from "./helpers";

test.afterAll(async () => {
  await closeSql();
});

async function openSettings(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

test("a member changes their name", async ({ page }, testInfo) => {
  const me = await signUpPilot(page, testInfo);
  await openSettings(page);
  const name = `Renamed ${me.name}`;
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue(name);

  const [entry] = await sql()`
    select a.after from audit_log a join member m on m.id = a.entity_id
    where m.email = ${me.email} and a.action = 'member.update'
  `;
  expect(entry.after).toEqual({ name });
});

test("a member changes their password", async ({ page }, testInfo) => {
  const me = await signUpPilot(page, testInfo);
  await openSettings(page);
  await page.getByLabel("Current password").fill("not my password");
  await page.getByLabel("New password").fill("a brand new password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(
    page.getByText("That isn't your current password."),
  ).toBeVisible();

  await page.getByLabel("Current password").fill(me.password);
  await page.getByLabel("New password").fill("a brand new password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();

  await signOut(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(me.email);
  await page.getByLabel("Password").fill("a brand new password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
});

test("a member pins the theme on their device", async ({
  browser,
}, testInfo) => {
  // A device set to light, so dark can only come from the setting.
  const context = await browser.newContext({ colorScheme: "light" });
  const page = await context.newPage();
  await signUpPilot(page, testInfo);
  await openSettings(page);

  // The page background's brightness, 0–255, read back by painting it.
  const brightness = () =>
    page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.fillStyle = getComputedStyle(document.body).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[0];
    });

  // Retried: a click before the page hydrates has nothing to apply it.
  const choose = (option: string, check: (b: number) => void) =>
    expect(async () => {
      await page.getByText(option, { exact: true }).click();
      check(await brightness());
    }).toPass();

  await choose("Dark", (b) => expect(b).toBeLessThan(40));
  // Still dark after a reload, before anything has hydrated.
  await page.reload();
  await expect.poll(brightness).toBeLessThan(40);
  await expect(page.getByLabel("Dark")).toBeChecked();

  await choose("Match device", (b) => expect(b).toBeGreaterThan(230));
  await context.close();
});

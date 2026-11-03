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

test("a member adds a phone number, which other members see", async ({
  page,
  browser,
}, testInfo) => {
  const me = await signUpPilot(page, testInfo);
  await openSettings(page);
  await page.getByLabel("Phone (optional)").fill("call me");
  await page.getByRole("button", { name: "Save contact details" }).click();
  await expect(
    page.getByText("Enter a phone number like 555-123-4567."),
  ).toBeVisible();

  // No password needed for the phone.
  await page.getByLabel("Phone (optional)").fill("(555) 010-2030");
  await page.getByRole("button", { name: "Save contact details" }).click();
  await expect(page.getByText("Contact details saved.")).toBeVisible();
  await expect(page.getByLabel("Phone (optional)")).toHaveValue(
    "(555) 010-2030",
  );
  const [entry] = await sql()`
    select a.after from audit_log a join member m on m.id = a.entity_id
    where m.email = ${me.email} and a.action = 'member.update'
  `;
  expect(entry.after).toEqual({ phone: "(555) 010-2030" });

  // Another member finds it in the directory.
  const context = await browser.newContext();
  const other = await context.newPage();
  await signUpPilot(other, testInfo);
  await other.goto("/");
  await other.getByRole("button", { name: "Account" }).click();
  await other.getByRole("link", { name: "Member directory" }).click();
  const listing = other.getByRole("listitem", { name: me.name });
  await expect(listing.getByRole("link", { name: me.email })).toHaveAttribute(
    "href",
    `mailto:${me.email}`,
  );
  await expect(
    listing.getByRole("link", { name: "(555) 010-2030" }),
  ).toHaveAttribute("href", "tel:5550102030");
  await context.close();
});

test("changing email takes the password, and changes the sign-in", async ({
  page,
}, testInfo) => {
  const me = await signUpPilot(page, testInfo);
  const email = `new-${me.email}`;
  await openSettings(page);
  await page.getByLabel("Email", { exact: true }).fill(email);
  const save = page.getByRole("button", { name: "Save contact details" });
  await save.click();
  await expect(
    page.getByText("Enter your password to change your email."),
  ).toBeVisible();
  await page.getByLabel("Password, to change your email").fill("not it");
  await save.click();
  await expect(page.getByText("That isn't your password.")).toBeVisible();

  await page.getByLabel("Password, to change your email").fill(me.password);
  await save.click();
  await expect(page.getByText("Contact details saved.")).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);

  await signOut(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(me.password);
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

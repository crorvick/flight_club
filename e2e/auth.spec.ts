import { expect, test } from "./fixtures";

import { approve, newMember, resetPassword, signOut, signUp } from "./helpers";

test("a new member waits for approval", async ({ page }, testInfo) => {
  const member = newMember(testInfo);
  await signUp(page, member);
  await expect(page.getByRole("status")).toContainText(
    "waiting for an officer to approve it",
  );
});

test("an approved member is signed in with their roles", async ({
  page,
}, testInfo) => {
  const member = newMember(testInfo);
  await signUp(page, member);
  await expect(page.getByRole("status")).toBeVisible();

  approve(member.email, "officer", "pilot");
  await page.reload();
  await page.getByRole("button", { name: "Account" }).click();
  const menu = page.getByRole("dialog");
  await expect(menu).toContainText(member.name);
  await expect(menu).toContainText("Pilot · Officer");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Password").fill(member.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", {
      name: `Welcome, ${member.name.split(" ")[0]}`,
    }),
  ).toBeVisible();
});

test("a wrong password keeps the email filled in", async ({
  page,
}, testInfo) => {
  const member = newMember(testInfo);
  await signUp(page, member);
  await signOut(page);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).click();

  // Not getByRole("alert"): Next.js adds its own route announcer with
  // that role.
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(member.email);
});

test("a reset password signs the member out and lets them back in", async ({
  page,
}, testInfo) => {
  const member = newMember(testInfo);
  await signUp(page, member);
  await expect(page.getByRole("status")).toBeVisible();

  resetPassword(member.email, "a brand new password");
  await page.reload();
  await page.getByRole("link", { name: "Sign in" }).click();

  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Password").fill(member.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();

  await page.getByLabel("Password").fill("a brand new password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("status")).toContainText(
    "waiting for an officer to approve it",
  );
});

test("sign-up rejects a short password", async ({ page }, testInfo) => {
  const member = { ...newMember(testInfo), password: "short" };
  await signUp(page, member);
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue(member.name);
});

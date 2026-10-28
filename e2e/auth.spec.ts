import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

// Unique per test and per project, since every device project runs the
// whole suite against the same database.
function newMember(testInfo: { project: { name: string } }) {
  const id = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: `Test ${id}`,
    email: `${id}@example.com`,
    password: "correct horse battery",
  };
}

async function signUp(page: Page, member: ReturnType<typeof newMember>) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(member.name);
  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Password").fill(member.password);
  await page.getByRole("button", { name: "Create account" }).click();
}

function approve(email: string, ...roles: string[]) {
  execFileSync("pnpm", ["-s", "member:approve", email, ...roles], {
    stdio: "pipe",
  });
}

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
  await expect(page.getByText(`Signed in as ${member.name}`)).toContainText(
    "officer, pilot",
  );

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Password").fill(member.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(`Signed in as ${member.name}`)).toBeVisible();
});

test("a wrong password keeps the email filled in", async ({
  page,
}, testInfo) => {
  const member = newMember(testInfo);
  await signUp(page, member);
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).click();

  // Not getByRole("alert"): Next.js adds its own route announcer with
  // that role.
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(member.email);
});

test("sign-up rejects a short password", async ({ page }, testInfo) => {
  const member = { ...newMember(testInfo), password: "short" };
  await signUp(page, member);
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue(member.name);
});

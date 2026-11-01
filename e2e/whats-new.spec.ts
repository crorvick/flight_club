import { expect, test } from "@playwright/test";

import { LATEST_RELEASE_NOTE } from "../src/lib/release-notes";
import { closeSql, signUpPilot, sql } from "./helpers";

test.afterAll(async () => {
  await closeSql();
});

const whatsNew = (page: import("@playwright/test").Page) =>
  page.getByRole("dialog", { name: "What's new" });

// As if they last used the app before any release notes.
const behind = (email: string) =>
  sql()`update member set last_seen_release_note = 0 where email = ${email}`;

test("a new member isn't shown what came before them", async ({
  page,
}, testInfo) => {
  const me = await signUpPilot(page, testInfo);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  await expect(whatsNew(page)).toHaveCount(0);
  const [row] = await sql()`
    select last_seen_release_note as seen from member where email = ${me.email}
  `;
  expect(row.seen).toBe(LATEST_RELEASE_NOTE);
});

test("a member sees what changed since they were last here, once", async ({
  page,
}, testInfo) => {
  const me = await signUpPilot(page, testInfo);
  await behind(me.email);

  await page.goto("/fleet");
  await expect(whatsNew(page)).toContainText("Settings, in the account menu");
  // Meant for officers.
  await expect(whatsNew(page)).not.toContainText("Officers can make members");
  await whatsNew(page).getByRole("button", { name: "Got it" }).click();
  await expect(whatsNew(page)).toHaveCount(0);

  await expect
    .poll(async () => {
      const [row] = await sql()`
        select last_seen_release_note as seen from member where email = ${me.email}
      `;
      return row.seen;
    })
    .toBe(LATEST_RELEASE_NOTE);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Fleet" })).toBeVisible();
  await expect(whatsNew(page)).toHaveCount(0);

  // Still there to read from the account menu.
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("link", { name: "What's new" }).click();
  await expect(
    page.getByText("Settings, in the account menu", { exact: false }),
  ).toBeVisible();
});

test("officers see the notes meant for them", async ({ page }, testInfo) => {
  const me = await signUpPilot(page, testInfo, ["officer", "pilot"]);
  await behind(me.email);
  await page.goto("/");
  await expect(whatsNew(page)).toContainText("Officers can make members");
});

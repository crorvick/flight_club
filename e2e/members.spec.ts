import { expect, test } from "@playwright/test";

import { closeSql, newMember, signUp, signUpPilot, sql } from "./helpers";

test.afterAll(async () => {
  await closeSql();
});

test("an officer approves a new member as a pilot", async ({
  page,
  browser,
}, testInfo) => {
  // The newcomer signs up in their own browser.
  const newcomer = newMember(testInfo);
  const theirs = await browser.newContext();
  const theirPage = await theirs.newPage();
  await signUp(theirPage, newcomer);
  await expect(theirPage.getByRole("status")).toContainText(
    "waiting for an officer",
  );

  await signUpPilot(page, testInfo, ["officer", "pilot"]);
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Members/ })).toContainText(
    "waiting",
  );
  await page.getByRole("link", { name: /Members/ }).click();

  const row = page.getByRole("listitem").filter({ hasText: newcomer.email });
  await row.getByRole("button", { name: "Approve as pilot" }).click();
  await expect(
    page
      .getByRole("region", { name: "Active" })
      .getByRole("link", { name: new RegExp(newcomer.name) }),
  ).toContainText("pilot");

  await theirPage.reload();
  await expect(
    theirPage.getByRole("link", { name: "Check out an aircraft" }),
  ).toBeVisible();
  await theirs.close();

  const [entry] = await sql()`
    select a.action, a.before, a.after
    from audit_log a join member m on m.id = a.entity_id
    where m.email = ${newcomer.email}
  `;
  expect(entry).toMatchObject({
    action: "member.update",
    before: { active: false, roles: [] },
    after: { active: true, roles: ["pilot"] },
  });
});

test("an officer changes a member's roles and deactivates them", async ({
  page,
  browser,
}, testInfo) => {
  const pilot = newMember(testInfo);
  const theirs = await browser.newContext();
  const theirPage = await theirs.newPage();
  await signUp(theirPage, pilot);

  await signUpPilot(page, testInfo, ["officer", "pilot"]);
  const [{ id }] =
    await sql()`select id from member where email = ${pilot.email}`;
  await page.goto(`/members/${id}`);
  await page.getByLabel(/Officer/).check();
  await page.getByLabel(/Pilot/).check();
  await page.getByLabel(/Active/).check();
  await page.getByRole("button", { name: "Save member" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByLabel(/Officer/)).toBeChecked();

  await theirPage.reload();
  await expect(theirPage.getByText(/pilot, officer/)).toBeVisible();

  // Deactivated, they keep their roles but can do nothing.  ("Saved." is
  // still showing from the first save, so wait for the database.)
  await page.getByLabel(/Active/).uncheck();
  await page.getByRole("button", { name: "Save member" }).click();
  await expect
    .poll(async () => {
      const [row] = await sql()`select active from member where id = ${id}`;
      return row.active;
    })
    .toBe(false);
  await theirPage.goto("/check-out");
  await expect(theirPage.getByRole("status")).toContainText(
    "Your account has been deactivated.",
  );
  await theirs.close();
});

test("an officer can't lock themselves out", async ({ page }, testInfo) => {
  const officer = await signUpPilot(page, testInfo, ["officer", "pilot"]);
  const [{ id }] =
    await sql()`select id from member where email = ${officer.email}`;
  await page.goto(`/members/${id}`);

  await page.getByLabel(/Officer/).uncheck();
  await page.getByRole("button", { name: "Save member" }).click();
  await expect(
    page.getByText("You can't remove your own officer role."),
  ).toBeVisible();

  await page.getByLabel(/Active/).uncheck();
  await page.getByRole("button", { name: "Save member" }).click();
  await expect(page.getByText("You can't deactivate yourself.")).toBeVisible();

  const [row] = await sql()`select active, roles from member where id = ${id}`;
  expect(row).toEqual({ active: true, roles: ["officer", "pilot"] });
});

test("pilots can't manage members", async ({ page }, testInfo) => {
  await signUpPilot(page, testInfo);
  await page.goto("/members");
  await expect(page.getByText("Not allowed")).toBeVisible();
});

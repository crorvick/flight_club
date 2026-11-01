import { expect, test } from "@playwright/test";

import {
  closeSql,
  createAircraft,
  createSquawk,
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

test("an officer resolves a grounding squawk, which ungrounds the aircraft", async ({
  page,
}, testInfo) => {
  const officer = await signUpPilot(page, testInfo, ["officer", "pilot"]);
  const id = await createSquawk(aircraft.id, {
    description: "Elevator trim jammed.",
    grounds: true,
  });

  await page.goto("/fleet");
  const card = page.getByRole("region", { name: aircraft.tailNumber });
  await expect(card).toContainText("Grounded");
  await card.getByRole("link", { name: /Elevator trim jammed/ }).click();

  // A grounding squawk can't just be deferred.
  await expect(page.getByRole("button", { name: "Defer" })).toHaveCount(0);

  const resolve = page.getByRole("button", {
    name: "Resolve and return to service",
  });
  await resolve.click();
  await expect(page.getByText("Say what was done about it.")).toBeVisible();

  await page
    .getByLabel("What was done about it?")
    .fill("Trim cable re-tensioned by the shop.");
  await resolve.click();
  await expect(page.getByText("Squawk resolved.")).toBeVisible();
  await expect(
    page.getByText(`${aircraft.tailNumber} is airworthy.`),
  ).toBeVisible();
  await expect(page.getByText(`Resolved by ${officer.name}`)).toBeVisible();

  const [entry] = await sql()`
    select a.action, a.before, a.after, m.email
    from audit_log a join member m on m.id = a.actor_id
    where a.entity_id = ${id}
  `;
  expect(entry).toMatchObject({
    action: "squawk.resolve",
    before: { status: "open" },
    after: {
      status: "resolved",
      resolutionNote: "Trim cable re-tensioned by the shop.",
    },
    email: officer.email,
  });

  await page.goto("/fleet");
  await expect(
    page.getByRole("region", { name: aircraft.tailNumber }),
  ).toContainText("Airworthy");
});

test("an officer defers and reopens a non-grounding squawk", async ({
  page,
}, testInfo) => {
  await signUpPilot(page, testInfo, ["officer", "pilot"]);
  const id = await createSquawk(aircraft.id, {
    description: "Sun visor loose.",
    grounds: false,
  });

  await page.goto(`/squawks/${id}`);
  await page.getByRole("button", { name: "Defer" }).click();
  await expect(page.getByText("Squawk deferred.")).toBeVisible();

  await page.goto("/fleet");
  await expect(
    page
      .getByRole("region", { name: aircraft.tailNumber })
      .getByRole("link", { name: /Sun visor loose/ }),
  ).toContainText("Deferred");

  await page.goto(`/squawks/${id}`);
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText("Squawk reopened.")).toBeVisible();
});

test("pilots can see squawks but not change them", async ({
  page,
}, testInfo) => {
  await signUpPilot(page, testInfo);
  const id = await createSquawk(aircraft.id, {
    description: "Fuel cap seal cracked.",
    grounds: true,
  });

  await page.goto(`/squawks/${id}`);
  await expect(page.getByText("Fuel cap seal cracked.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Officer" })).toHaveCount(0);
});

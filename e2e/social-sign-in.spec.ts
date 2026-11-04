import { expect, type Page, test } from "./fixtures";

import {
  closeSql,
  newMember,
  resetPassword,
  signOut,
  signUp,
  sql,
  type TestMember,
} from "./helpers";

test.afterAll(async () => {
  await closeSql();
});

const PROVIDERS = {
  google: "https://accounts.google.com/",
  apple: "https://appleid.apple.com/",
};

// Where pressing a button sends the browser, as the app's redirect says;
// the browser is stopped there, as the provider can't be signed in to
// from a test.
async function handOff(page: Page, provider: keyof typeof PROVIDERS) {
  await page.route(`${PROVIDERS[provider]}**`, (route) =>
    route.fulfill({ body: "Stopped at the provider" }),
  );
  const redirect = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      (response.headers()["x-action-redirect"] ?? "").startsWith(
        PROVIDERS[provider],
      ),
  );
  return async (button: string) => {
    await page.getByRole("button", { name: button }).click();
    const target = (await redirect).headers()["x-action-redirect"];
    // Next appends how to navigate: ";push" or ";replace".
    return new URL(target.replace(/;(push|replace)$/, ""));
  };
}

// A member who has only ever signed in with Google.
async function googleOnly(member: TestMember) {
  await sql()`
    insert into account (account_id, provider_id, user_id)
    select ${`google-${member.email}`}, 'google', id
    from member where email = ${member.email}
  `;
  await sql()`
    delete from account where provider_id = 'credential'
      and user_id = (select id from member where email = ${member.email})
  `;
}

test("signing in hands off to Google", async ({ page }) => {
  await page.goto("/sign-in");
  const google = await handOff(page, "google");
  const toGoogle = await google("Continue with Google");
  expect(toGoogle.searchParams.get("client_id")).toBe("e2e-google-client");
  expect(toGoogle.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3100/api/auth/callback/google",
  );
});

test("signing up hands off to Apple", async ({ page, browserName }) => {
  // WebKit claims appleid.apple.com for the system's own Sign in with
  // Apple, and now and then hangs closing the page after.  Which URL the
  // app sends the browser to doesn't depend on the browser.
  test.skip(browserName === "webkit", "WebKit intercepts Sign in with Apple");
  await page.goto("/sign-up");
  const apple = await handOff(page, "apple");
  const toApple = await apple("Continue with Apple");
  expect(toApple.searchParams.get("client_id")).toBe("org.example.e2e");
  expect(toApple.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3100/api/auth/callback/apple",
  );
});

test("an existing member is told to link Google or Apple first", async ({
  page,
}) => {
  await page.goto("/sign-in?error=account_not_linked");
  await expect(
    page.getByText(
      "You already have an account with that email. Sign in with your password, then link Google or Apple in Settings.",
    ),
  ).toBeVisible();
});

test("a member links Google from Settings", async ({ page }, testInfo) => {
  await signUp(page, newMember(testInfo));
  await expect(page.getByRole("status")).toBeVisible();
  await page.goto("/settings");
  const google = await handOff(page, "google");
  const toGoogle = await google("Link Google");
  expect(toGoogle.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3100/api/auth/callback/google",
  );

  await page.goto("/settings?error=account_already_linked_to_different_user");
  await expect(
    page.getByText("That account is already linked to another member."),
  ).toBeVisible();
});

test("a member with only Google sets a password before unlinking it", async ({
  page,
}, testInfo) => {
  const member = newMember(testInfo);
  await signUp(page, member);
  await expect(page.getByRole("status")).toBeVisible();
  await googleOnly(member);

  await page.goto("/settings");
  await expect(
    page.getByText("To change your email, set a password below first."),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(`new-${member.email}`);
  await page.getByRole("button", { name: "Save contact details" }).click();
  await expect(
    page.getByText("Set a password below first: changing your email needs it."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Unlink Google" }).click();
  await expect(page.getByText(/It's your only way to sign in/)).toBeVisible();

  await page.getByLabel("New password").fill("a password at last");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(
    page.getByText("Password set. You can sign in with your email too."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unlink Google" }).click();
  await expect(page.getByText("Unlinked.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Link Google" })).toBeVisible();

  await signOut(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Password").fill("a password at last");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "waiting for an officer to approve it",
  );
});

test("the reset script gives a Google-only member a password", async ({
  page,
}, testInfo) => {
  const member = newMember(testInfo);
  await signUp(page, member);
  await expect(page.getByRole("status")).toBeVisible();
  await googleOnly(member);

  resetPassword(member.email, "set by an officer");
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Password").fill("set by an officer");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "waiting for an officer to approve it",
  );
});

test("a new member without a name is asked for one", async ({
  page,
}, testInfo) => {
  const member = newMember(testInfo);
  await signUp(page, member);
  await expect(page.getByRole("status")).toBeVisible();
  // As Apple leaves it when the member keeps their name to themselves.
  await sql()`update member set name = '' where email = ${member.email}`;

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What's your name?" }),
  ).toBeVisible();
  await page.getByLabel("Name").fill("Avery Quinn");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("status")).toContainText("Thanks, Avery Quinn.");
});

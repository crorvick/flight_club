import { expect, test } from "./fixtures";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Flight Club" }),
  ).toBeVisible();
});

test("health check reports the database as reachable", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    status: "ok",
    database: "ok",
  });
});

test("can be installed to the home screen", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({
    name: "Flight Club",
    display: "standalone",
  });
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok(), icon.src).toBe(true);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test("follows the device's dark mode", async ({ browser }) => {
  // The page background's brightness, 0–255.  Browsers report computed
  // colours in different spaces (rgb, oklch, lab), so paint it and read
  // the pixel back.  Polled, since the dev server can apply its styles a
  // moment after the page has loaded.
  const expectBrightness = async (
    colorScheme: "light" | "dark",
    check: (brightness: number) => boolean,
  ) => {
    const context = await browser.newContext({ colorScheme });
    const page = await context.newPage();
    await page.goto("/");
    await expect
      .poll(async () =>
        check(
          await page.evaluate(() => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const context = canvas.getContext("2d")!;
            context.fillStyle = getComputedStyle(document.body).backgroundColor;
            context.fillRect(0, 0, 1, 1);
            return context.getImageData(0, 0, 1, 1).data[0];
          }),
        ),
      )
      .toBe(true);
    await context.close();
  };
  await expectBrightness("light", (b) => b > 230);
  await expectBrightness("dark", (b) => b < 40);
});

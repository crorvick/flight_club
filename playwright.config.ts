import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  // Members mostly use phones on the ramp, so phone and tablet sizes are
  // first-class targets alongside desktop.
  projects: [
    { name: "iphone", use: { ...devices["iPhone 17"] } },
    { name: "android", use: { ...devices["Pixel 9"] } },
    { name: "ipad", use: { ...devices["iPad (gen 11)"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // CI tests the production build; locally the dev server is quicker to
    // iterate against.
    command: isCI ? "pnpm start" : `pnpm dev --port ${port}`,
    env: { PORT: String(port) },
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});

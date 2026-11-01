import type { FullConfig } from "@playwright/test";

// The dev server compiles each route on first request, and compiling one
// with server actions makes it reload pages already open in the browser,
// wiping forms that tests are filling in.  Request every page once before
// the tests start so that happens here instead.  The production server
// used in CI has nothing to compile.
export default async function warmUp(config: FullConfig) {
  if (process.env.CI) return;
  const baseURL = config.projects[0].use.baseURL;
  for (const path of ["/", "/sign-in", "/sign-up", "/flights/new"]) {
    await fetch(new URL(path, baseURL), { redirect: "manual" });
  }
}

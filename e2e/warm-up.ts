import type { FullConfig } from "@playwright/test";

// The dev server compiles each route on first request, and compiling one
// with server actions makes it reload pages already open in the browser,
// wiping forms that tests are filling in.  Request every page once before
// the tests start so that happens here instead.  The production server
// used in CI has nothing to compile.
// Routes with an id in the path are compiled through a made-up one: the
// request is turned away, but the route is built all the same.
const ID = "00000000-0000-4000-8000-000000000000";

export default async function warmUp(config: FullConfig) {
  if (process.env.CI) return;
  const baseURL = config.projects[0].use.baseURL;
  for (const path of [
    "/",
    "/sign-in",
    "/sign-up",
    "/check-out",
    "/squawks/new",
    "/fleet",
    "/members",
    "/aircraft",
    "/aircraft/new",
    "/qualifications",
    "/settings",
    "/whats-new",
    "/reports",
    "/reports/oil",
    "/reports/mechanic",
    "/reports/flights",
    `/aircraft/${ID}`,
    `/aircraft/${ID}/maintenance`,
    `/aircraft/${ID}/flights`,
    `/aircraft/${ID}/flights/new`,
    `/maintenance/${ID}`,
    `/members/${ID}`,
    `/flights/${ID}`,
    `/flights/${ID}/edit`,
    `/squawks/${ID}`,
    `/dispatches/${ID}`,
  ]) {
    await fetch(new URL(path, baseURL), { redirect: "manual" });
  }
}

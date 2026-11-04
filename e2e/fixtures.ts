import { type BrowserContext, test as base } from "@playwright/test";

export * from "@playwright/test";

const noGravatar = (context: BrowserContext) =>
  context.route("https://gravatar.com/**", (route) =>
    route.fulfill({ status: 404 }),
  );

// Every browser context answers Gravatar itself, with "no picture", so
// the suite neither waits on it nor sends it the test members'
// addresses: the test's own, and any a test opens for a second member.
// A test can route it again to serve one.  (`provide` is Playwright's
// `use`, renamed so the React hooks lint rule leaves it alone.)
export const test = base.extend<object, { noGravatar: void }>({
  context: async ({ context }, provide) => {
    await noGravatar(context);
    await provide(context);
  },
  // Contexts tests open themselves come from browser.newContext().
  noGravatar: [
    async ({ browser }, provide) => {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const context = await newContext(options);
        await noGravatar(context);
        return context;
      };
      await provide();
    },
    { scope: "worker", auto: true },
  ],
});

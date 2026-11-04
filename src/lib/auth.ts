import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { LATEST_RELEASE_NOTE } from "@/lib/release-notes";
import { enabledProviders } from "@/lib/sign-in-methods";

const DAY = 60 * 60 * 24;

function createAuth() {
  const env = serverEnv();
  const providers = enabledProviders(env);
  const apple = providers.includes("apple");
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
    },
    // Google and Apple, where configured.  Signing in with one for the
    // first time creates an account, inactive like any other; an existing
    // member links theirs in Settings instead (lib/sign-in-methods.ts).
    socialProviders: {
      ...(providers.includes("google") && {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        },
      }),
      ...(apple && {
        apple: {
          clientId: env.APPLE_CLIENT_ID!,
          clientSecret: env.APPLE_CLIENT_SECRET!,
        },
      }),
    },
    // Apple posts its answer back from its own origin.
    trustedOrigins: apple ? ["https://appleid.apple.com"] : [],
    account: {
      accountLinking: {
        // Linking happens signed in, from Settings, so the Google or Apple
        // account can use another address than the club knows them by.
        allowDifferentEmails: true,
      },
    },
    // Members sign in on the ramp, often with gloves on and bad signal, so
    // sessions last long and renew themselves on use: anyone who opens the
    // app at least every six months stays signed in.
    session: {
      expiresIn: 180 * DAY,
      updateAge: DAY,
    },
    user: {
      modelName: "member",
      // Members change their own email in Settings.  The app sends no
      // email, so there's no verifying the new address; the settings
      // action asks for their password instead, so a session left open on
      // a shared computer can't take over the account.
      changeEmail: { enabled: true, updateEmailWithoutVerification: true },
      additionalFields: {
        // Both are server-owned (`input: false`): sign-up can't set them,
        // only an officer can.  New members wait, inactive and untagged,
        // until one approves them.
        roles: {
          type: "string[]",
          input: false,
          required: false,
          defaultValue: [],
        },
        active: {
          type: "boolean",
          input: false,
          required: false,
          defaultValue: false,
        },
        // A new member has nothing to catch up on, so starts at the
        // latest release notes rather than being shown them all.
        lastSeenReleaseNote: {
          type: "number",
          input: false,
          required: false,
          defaultValue: LATEST_RELEASE_NOTE,
        },
      },
    },
    advanced: {
      database: { generateId: "uuid" },
    },
    // Lets server actions set the session cookie; must be the last plugin.
    plugins: [nextCookies()],
  });
}

let cached: ReturnType<typeof createAuth> | undefined;

// Created on first use, like the database connection, so that importing
// this module during `next build` doesn't need runtime configuration.
export function auth() {
  cached ??= createAuth();
  return cached;
}

import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { serverEnv } from "@/lib/env";

const DAY = 60 * 60 * 24;

function createAuth() {
  const env = serverEnv();
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
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

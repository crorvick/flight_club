// The ways a member can sign in besides a password, and what to say when
// one goes wrong.  Kept free of the server so pages and tests share it.

import type { ServerEnv } from "./env";

export const SOCIAL_PROVIDERS = ["google", "apple"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: "Google",
  apple: "Apple",
};

// Those this environment has credentials for.
export function enabledProviders(env: ServerEnv): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter((provider) =>
    provider === "google"
      ? env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      : env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET,
  );
}

// Better Auth sends a failed sign-in or link back with ?error=<code>.
// Only the codes a member can do something about get their own words.
const SIGN_IN_ERRORS: Record<string, string> = {
  // An existing member's email isn't verified (the app sends no email),
  // so Better Auth won't join a Google or Apple account to theirs on its
  // own: whoever made the account might not own the address.
  account_not_linked:
    "You already have an account with that email. Sign in with your password, then link Google or Apple in Settings.",
  email_not_found:
    "Google or Apple didn't share an email address, which the club needs. Try again and allow it.",
};

const LINK_ERRORS: Record<string, string> = {
  account_already_linked_to_different_user:
    "That account is already linked to another member.",
};

export function signInError(code: unknown) {
  if (typeof code !== "string") return undefined;
  return (
    SIGN_IN_ERRORS[code] ??
    "Signing in with Google or Apple didn't work. Try again, or use your password."
  );
}

export function linkError(code: unknown) {
  if (typeof code !== "string") return undefined;
  return LINK_ERRORS[code] ?? "Linking didn't work. Try again.";
}

// Apple's Hide My Email gives the club an address only Apple can forward
// to, which other members can't use.
export const isRelayEmail = (email: string) =>
  email.toLowerCase().endsWith("@privaterelay.appleid.com");

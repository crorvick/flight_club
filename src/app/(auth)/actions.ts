"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { type FormState, formValues } from "@/lib/form-state";
import { SOCIAL_PROVIDERS, type SocialProvider } from "@/lib/sign-in-methods";

const signInSchema = z.object({
  email: z.email("Enter your email address."),
  password: z.string().min(1, "Enter your password."),
});

// Better Auth's own default limits, so errors show up here first.
const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name."),
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(128, "Use at most 128 characters."),
});

export async function signIn(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData, ["email"]);
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }

  try {
    await auth().api.signInEmail({
      body: parsed.data,
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 401) {
      return { error: "Incorrect email or password.", values };
    }
    throw error;
  }
  redirect("/");
}

export async function signUp(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData, ["name", "email"]);
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }

  try {
    await auth().api.signUpEmail({
      body: parsed.data,
      headers: await headers(),
    });
  } catch (error) {
    // Validation and duplicate-account errors carry messages meant for the
    // person filling in the form.
    if (error instanceof APIError && error.statusCode < 500) {
      return { error: error.message, values };
    }
    throw error;
  }
  redirect("/");
}

// Off to Google or Apple, which send the member back to the home page:
// signed in, or with a new account waiting for approval.  Failures come
// back to the sign-in page to be explained (signInError).
export async function continueWith(provider: SocialProvider) {
  if (!SOCIAL_PROVIDERS.includes(provider)) redirect("/sign-in");
  const { url } = await auth().api.signInSocial({
    body: { provider, callbackURL: "/", errorCallbackURL: "/sign-in" },
    headers: await headers(),
  });
  redirect(url!);
}

export async function signOut() {
  await auth().api.signOut({ headers: await headers() });
  redirect("/");
}

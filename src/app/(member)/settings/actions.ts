"use server";

import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import { member } from "@/db/schema";
import { changedFields } from "@/lib/audit-diff";
import { auth } from "@/lib/auth";
import { parsePhone } from "@/lib/contact";
import { type FormState, formValues } from "@/lib/form-state";
import { getCurrentMember } from "@/lib/session";
import { hasPassword } from "@/lib/sign-in-accounts";
import { SOCIAL_PROVIDERS, type SocialProvider } from "@/lib/sign-in-methods";

// Settings are a member's own, so even one waiting for approval or
// deactivated can change them; only being signed in matters.
async function signedIn() {
  const me = await getCurrentMember();
  if (!me) redirect("/sign-in");
  return me;
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(100, "Keep it under 100 characters.");

export async function updateName(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await signedIn();
  const values = formValues(formData, ["name"]);
  const name = nameSchema.safeParse(values.name);
  if (!name.success) {
    return { fieldErrors: { name: [name.error.issues[0].message] }, values };
  }
  // Asked for on the home page of a new member who signed up through
  // Apple without sharing it.
  const done = formData.get("from") === "home" ? "/" : "/settings?saved=name";
  if (name.data === me.name) redirect(done);

  // Officers see it on flights, squawks and the member list, so a change
  // is audited like their own changes to a member.
  await db().transaction(async (tx) => {
    await tx
      .update(member)
      .set({ name: name.data })
      .where(eq(member.id, me.id));
    await writeAudit(tx, {
      actorId: me.id,
      action: "member.update",
      entityType: "member",
      entityId: me.id,
      before: { name: me.name },
      after: { name: name.data },
    });
  });
  redirect(done);
}

// Better Auth's own default limits, as at sign-up.
const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(128, "Use at most 128 characters."),
});

export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await signedIn();
  // Passwords are never echoed back into the form.
  const values = formValues(formData, ["signOutOthers"]);
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    newPassword: formData.get("newPassword") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }

  try {
    await auth().api.changePassword({
      body: {
        ...parsed.data,
        revokeOtherSessions: formData.get("signOutOthers") === "on",
      },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError && error.body?.code === "INVALID_PASSWORD") {
      return {
        fieldErrors: {
          currentPassword: ["That isn't your current password."],
        },
        values,
      };
    }
    if (error instanceof APIError && error.statusCode < 500) {
      return { error: error.message, values };
    }
    throw error;
  }
  redirect("/settings?saved=password");
}

// Email is also how a member signs in, so changing it needs their
// password; the phone number doesn't.  Both are audited, since officers
// and other members rely on them to reach the member.
export async function updateContact(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const me = await signedIn();
  const values = formValues(formData, ["email", "phone"]);
  const fieldErrors: Record<string, string[]> = {};
  const email = z
    .email("Enter an email address like you@example.com.")
    .safeParse(values.email.trim().toLowerCase());
  if (!email.success) fieldErrors.email = [email.error.issues[0].message];
  const phone = parsePhone(values.phone);
  if (phone.status === "invalid") fieldErrors.phone = [phone.message];
  if (!email.success || phone.status === "invalid") {
    return { fieldErrors, values };
  }

  const [current] = await db()
    .select({ phone: member.phone })
    .from(member)
    .where(eq(member.id, me.id));
  const before = { email: me.email, phone: current.phone };
  const after = { email: email.data, phone: phone.value };

  if (after.email !== before.email) {
    // One who signs in only with Google or Apple sets a password first.
    if (!(await hasPassword(me.id))) {
      return {
        error: "Set a password below first: changing your email needs it.",
        values,
      };
    }
    const password = String(formData.get("password") ?? "");
    if (!password) {
      return {
        fieldErrors: {
          password: ["Enter your password to change your email."],
        },
        values,
      };
    }
    const requestHeaders = await headers();
    try {
      await auth().api.verifyPassword({
        body: { password },
        headers: requestHeaders,
      });
    } catch (error) {
      if (
        error instanceof APIError &&
        error.body?.code === "INVALID_PASSWORD"
      ) {
        return {
          fieldErrors: { password: ["That isn't your password."] },
          values,
        };
      }
      throw error;
    }
    // Better Auth quietly does nothing for an address that's taken, so
    // as not to reveal who has an account; members see each other's
    // anyway, so say so.
    const [taken] = await db()
      .select({ id: member.id })
      .from(member)
      .where(eq(member.email, after.email));
    if (taken) {
      return {
        fieldErrors: { email: ["Another member already uses that email."] },
        values,
      };
    }
    // Through Better Auth, which also updates the session's copy.
    await auth().api.changeEmail({
      body: { newEmail: after.email },
      headers: requestHeaders,
    });
  }

  const diff = changedFields(before, after);
  if (!diff.changed) redirect("/settings?saved=contact");
  await db().transaction(async (tx) => {
    if (after.phone !== before.phone) {
      await tx
        .update(member)
        .set({ phone: after.phone })
        .where(eq(member.id, me.id));
    }
    await writeAudit(tx, {
      actorId: me.id,
      action: "member.update",
      entityType: "member",
      entityId: me.id,
      before: diff.before,
      after: diff.after,
    });
  });
  redirect("/settings?saved=contact");
}

// For a member who has only signed in with Google or Apple: a password
// lets them sign in with their email too, and change it.
export async function setPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await signedIn();
  const parsed = passwordSchema.shape.newPassword.safeParse(
    formData.get("newPassword") ?? "",
  );
  if (!parsed.success) {
    return { fieldErrors: { newPassword: [parsed.error.issues[0].message] } };
  }
  try {
    await auth().api.setPassword({
      body: { newPassword: parsed.data },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError && error.statusCode < 500) {
      return { error: error.message };
    }
    throw error;
  }
  redirect("/settings?saved=password-set");
}

// Off to Google or Apple to prove the account is theirs, and back to
// Settings: linked, or with ?error=<code> (linkError).
export async function linkProvider(provider: SocialProvider) {
  await signedIn();
  if (!SOCIAL_PROVIDERS.includes(provider)) redirect("/settings");
  const { url } = await auth().api.linkSocialAccount({
    body: {
      provider,
      callbackURL: "/settings?saved=linked",
      errorCallbackURL: "/settings",
    },
    headers: await headers(),
  });
  redirect(url);
}

// By the account's own id, from the Settings page; Better Auth only
// unlinks the member's own.
export async function unlinkProvider(accountId: string): Promise<FormState> {
  await signedIn();
  try {
    await auth().api.unlinkAccount({
      body: { accountId },
      headers: await headers(),
    });
  } catch (error) {
    if (!(error instanceof APIError) || error.statusCode >= 500) throw error;
    return {
      error:
        error.body?.code === "SESSION_NOT_FRESH"
          ? // Better Auth asks for a sign-in within the last day.
            "For safety, sign out and back in, then unlink it."
          : error.body?.code === "FAILED_TO_UNLINK_LAST_ACCOUNT"
            ? "It's your only way to sign in. Set a password or link another account first."
            : error.message,
    };
  }
  redirect("/settings?saved=unlinked");
}

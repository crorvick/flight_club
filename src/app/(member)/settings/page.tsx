import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Flash } from "@/components/flash";
import { FormSkeleton } from "@/components/page-skeleton";
import { SectionCard } from "@/components/section-card";
import { db } from "@/db";
import { member } from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { getCurrentMember } from "@/lib/session";
import { signInAccounts } from "@/lib/sign-in-accounts";
import {
  enabledProviders,
  isRelayEmail,
  linkError,
  SOCIAL_PROVIDERS,
} from "@/lib/sign-in-methods";

import {
  changePassword,
  linkProvider,
  setPassword,
  unlinkProvider,
  updateContact,
  updateName,
} from "./actions";
import {
  ContactForm,
  LinkedAccounts,
  NameForm,
  PasswordForm,
  SetPasswordForm,
  ThemePicker,
} from "./settings-forms";

export const metadata: Metadata = { title: "Settings · Flight Club" };

const CONFIRMATIONS: Record<string, string> = {
  name: "Name saved.",
  password: "Password changed.",
  "password-set": "Password set. You can sign in with your email too.",
  contact: "Contact details saved.",
  linked: "Linked. You can sign in with it now.",
  unlinked: "Unlinked.",
};

export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Suspense fallback={<FormSkeleton fields={4} />}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Settings({
  searchParams,
}: Pick<PageProps<"/settings">, "searchParams">) {
  // A member's own settings: any signed-in member, approved or not.
  const me = await getCurrentMember();
  if (!me) redirect("/sign-in");
  const { saved, error } = await searchParams;
  const [[{ phone }], accounts] = await Promise.all([
    db()
      .select({ phone: member.phone })
      .from(member)
      .where(eq(member.id, me.id)),
    signInAccounts(me.id),
  ]);
  const password = accounts.some((a) => a.providerId === "credential");
  // Those this environment offers, and any linked before one was turned
  // off, so it can still be unlinked.
  const enabled = enabledProviders(serverEnv());
  const links = SOCIAL_PROVIDERS.flatMap((provider) => {
    const linked = accounts.find((a) => a.providerId === provider);
    if (!linked && !enabled.includes(provider)) return [];
    return [
      linked
        ? {
            provider,
            accountId: linked.id,
            unlink: unlinkProvider.bind(null, linked.id),
          }
        : { provider, link: linkProvider.bind(null, provider) },
    ];
  });

  return (
    <>
      <Flash message={typeof saved === "string" && CONFIRMATIONS[saved]} />
      {/* A failed link comes back here with ?error=<code>. */}
      {linkError(error) && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 p-4 text-destructive"
        >
          {linkError(error)}
        </p>
      )}
      <SectionCard
        title="Profile"
        description="Your name is what officers and other pilots see."
      >
        <NameForm key={me.name} action={updateName} name={me.name} />
      </SectionCard>

      <SectionCard
        title="Contact details"
        description="Shown to other members, so they can reach you about an aircraft. Your email is also how you sign in."
      >
        {isRelayEmail(me.email) && (
          <p className="text-sm text-muted-foreground">
            This is the private address Apple made for you, which other members
            can&apos;t use to reach you. Give your own email instead.
          </p>
        )}
        {/* Keyed so a save re-renders the form with the stored values. */}
        <ContactForm
          key={`${me.email}-${phone}`}
          action={updateContact}
          email={me.email}
          phone={phone ?? ""}
          hasPassword={password}
        />
      </SectionCard>

      {password ? (
        <SectionCard title="Password">
          <PasswordForm action={changePassword} />
        </SectionCard>
      ) : (
        <SectionCard
          title="Password"
          description="You sign in with Google or Apple. Set a password to sign in with your email too."
        >
          <SetPasswordForm action={setPassword} />
        </SectionCard>
      )}

      {links.length > 0 && (
        <SectionCard
          title="Google and Apple"
          description="Link either to sign in with it instead of your password."
        >
          <LinkedAccounts links={links} />
        </SectionCard>
      )}

      <SectionCard
        title="Appearance"
        description="For this device only. Matching the device follows its own light and dark setting, which many phones switch at sunset."
      >
        <ThemePicker />
      </SectionCard>
    </>
  );
}

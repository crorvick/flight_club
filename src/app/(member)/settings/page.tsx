import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Flash } from "@/components/flash";
import { FormSkeleton } from "@/components/page-skeleton";
import { SectionCard } from "@/components/section-card";
import { db } from "@/db";
import { member } from "@/db/schema";
import { getCurrentMember } from "@/lib/session";

import { changePassword, updateContact, updateName } from "./actions";
import {
  ContactForm,
  NameForm,
  PasswordForm,
  ThemePicker,
} from "./settings-forms";

export const metadata: Metadata = { title: "Settings · Flight Club" };

const CONFIRMATIONS: Record<string, string> = {
  name: "Name saved.",
  password: "Password changed.",
  contact: "Contact details saved.",
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
  const { saved } = await searchParams;
  const [{ phone }] = await db()
    .select({ phone: member.phone })
    .from(member)
    .where(eq(member.id, me.id));

  return (
    <>
      <Flash message={typeof saved === "string" && CONFIRMATIONS[saved]} />
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
        {/* Keyed so a save re-renders the form with the stored values. */}
        <ContactForm
          key={`${me.email}-${phone}`}
          action={updateContact}
          email={me.email}
          phone={phone ?? ""}
        />
      </SectionCard>

      <SectionCard title="Password">
        <PasswordForm action={changePassword} />
      </SectionCard>

      <SectionCard
        title="Appearance"
        description="For this device only. Matching the device follows its own light and dark setting, which many phones switch at sunset."
      >
        <ThemePicker />
      </SectionCard>
    </>
  );
}

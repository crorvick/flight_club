import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Flash } from "@/components/flash";
import { FormSkeleton } from "@/components/page-skeleton";
import { SectionCard } from "@/components/section-card";
import { getCurrentMember } from "@/lib/session";

import { changePassword, updateName } from "./actions";
import { NameForm, PasswordForm, ThemePicker } from "./settings-forms";

export const metadata: Metadata = { title: "Settings · Flight Club" };

const CONFIRMATIONS: Record<string, string> = {
  name: "Name saved.",
  password: "Password changed.",
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

  return (
    <>
      <Flash message={typeof saved === "string" && CONFIRMATIONS[saved]} />
      <SectionCard
        title="Profile"
        description={`Signed in as ${me.email}. Your name is what officers and other pilots see.`}
      >
        <NameForm key={me.name} action={updateName} name={me.name} />
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

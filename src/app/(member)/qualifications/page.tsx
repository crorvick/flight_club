import type { Metadata } from "next";
import { Suspense } from "react";

import { Flash } from "@/components/flash";
import { FormSkeleton } from "@/components/page-skeleton";
import { requireMember } from "@/lib/session";

import { QualificationsPanel } from "./qualifications-panel";

export const metadata: Metadata = { title: "My qualifications · Flight Club" };

export default function QualificationsPage({
  searchParams,
}: PageProps<"/qualifications">) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        My qualifications
      </h1>
      <Suspense fallback={<FormSkeleton />}>
        <MyQualifications searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MyQualifications({
  searchParams,
}: Pick<PageProps<"/qualifications">, "searchParams">) {
  const member = await requireMember("pilot");
  const { saved } = await searchParams;
  return (
    <>
      <Flash message={!!saved && "Saved."} />
      <QualificationsPanel memberId={member.id} canManageCheckouts={false} />
    </>
  );
}

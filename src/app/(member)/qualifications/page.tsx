import type { Metadata } from "next";
import { Suspense } from "react";

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
      <Suspense fallback={<div className="h-96" />}>
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
      {saved && (
        <p
          role="status"
          className="rounded-lg border border-green-600/40 bg-green-600/10 p-4 font-semibold text-green-800 dark:text-green-300"
        >
          Saved.
        </p>
      )}
      <QualificationsPanel memberId={member.id} canManageCheckouts={false} />
    </>
  );
}

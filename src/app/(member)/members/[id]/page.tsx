import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Flash } from "@/components/flash";
import { LocalTime } from "@/components/local-time";
import { FormSkeleton } from "@/components/page-skeleton";
import { SectionCard } from "@/components/section-card";
import { db } from "@/db";
import { member } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { isPending } from "@/lib/member-rules";
import { isRoleTag } from "@/lib/roles";
import { requireMember } from "@/lib/session";

import { QualificationsPanel } from "../../qualifications/qualifications-panel";
import { updateMember } from "../actions";
import { MemberForm } from "./member-form";

export const metadata: Metadata = { title: "Member · Flight Club" };

export default function MemberPage({
  params,
  searchParams,
}: PageProps<"/members/[id]">) {
  return (
    <Suspense fallback={<FormSkeleton title />}>
      <MemberDetails params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function MemberDetails({
  params,
  searchParams,
}: Pick<PageProps<"/members/[id]">, "params" | "searchParams">) {
  const officer = await requireMember("officer");
  const { id } = await params;
  const { saved } = await searchParams;
  if (!isUuid(id)) notFound();

  const [row] = await db().select().from(member).where(eq(member.id, id));
  if (!row) notFound();
  const roles = row.roles.filter(isRoleTag);

  return (
    <>
      <Flash message={!!saved && "Saved."} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{row.name}</h1>
        <p className="break-all text-muted-foreground">{row.email}</p>
        <p className="text-sm text-muted-foreground">
          Joined <LocalTime at={row.createdAt} format="date" />
          {isPending({ active: row.active, roles }) &&
            " · waiting for approval"}
        </p>
      </div>
      <SectionCard title="Membership">
        {/* Keyed so a save re-renders the form with the stored values. */}
        <MemberForm
          key={`${row.active}-${roles.join()}`}
          action={updateMember.bind(null, row.id)}
          active={row.active}
          roles={roles}
          self={row.id === officer.id}
        />
      </SectionCard>
      {roles.includes("pilot") && (
        <QualificationsPanel memberId={row.id} canManageCheckouts />
      )}
    </>
  );
}

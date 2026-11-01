import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { db } from "@/db";
import { member } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { isPending } from "@/lib/member-rules";
import { isRoleTag } from "@/lib/roles";
import { requireMember } from "@/lib/session";

import { updateMember } from "../actions";
import { MemberForm } from "./member-form";

export const metadata: Metadata = { title: "Member · Flight Club" };

export default function MemberPage({
  params,
  searchParams,
}: PageProps<"/members/[id]">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
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
      {saved && (
        <p
          role="status"
          className="rounded-lg border border-green-600/40 bg-green-600/10 p-4 font-semibold text-green-800 dark:text-green-300"
        >
          Saved.
        </p>
      )}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{row.name}</h1>
        <p className="break-all text-muted-foreground">{row.email}</p>
        <p className="text-sm text-muted-foreground">
          Joined {row.createdAt.toISOString().slice(0, 10)}
          {isPending({ active: row.active, roles }) &&
            " · waiting for approval"}
        </p>
      </div>
      {/* Keyed so a save re-renders the form with the stored values. */}
      <MemberForm
        key={`${row.active}-${roles.join()}`}
        action={updateMember.bind(null, row.id)}
        active={row.active}
        roles={roles}
        self={row.id === officer.id}
      />
    </>
  );
}

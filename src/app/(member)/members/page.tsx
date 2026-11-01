import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { member } from "@/db/schema";
import { isPending } from "@/lib/member-rules";
import { isRoleTag } from "@/lib/roles";
import { requireMember } from "@/lib/session";

import { approveAsPilot } from "./actions";

export const metadata: Metadata = { title: "Members · Flight Club" };

export default function MembersPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <Members />
      </Suspense>
    </>
  );
}

async function Members() {
  await requireMember("officer");
  const rows = await db()
    .select({
      id: member.id,
      name: member.name,
      email: member.email,
      active: member.active,
      roles: member.roles,
    })
    .from(member)
    .orderBy(asc(member.name));
  const members = rows.map((m) => ({ ...m, roles: m.roles.filter(isRoleTag) }));

  const pending = members.filter(isPending);
  const active = members.filter((m) => m.active);
  const inactive = members.filter((m) => !m.active && !isPending(m));

  return (
    <>
      {pending.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Waiting for approval</h2>
          <ul className="divide-y rounded-lg border">
            {pending.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
              >
                <Link href={`/members/${m.id}`} className="min-w-0">
                  <span className="block font-medium">{m.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {m.email}
                  </span>
                </Link>
                <form action={approveAsPilot.bind(null, m.id)}>
                  <Button type="submit" className="h-11 text-base">
                    Approve as pilot
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MemberList title="Active" members={active} />
      <MemberList title="Deactivated" members={inactive} />
    </>
  );
}

function MemberList({
  title,
  members,
}: {
  title: string;
  members: { id: string; name: string; email: string; roles: string[] }[];
}) {
  if (members.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="divide-y rounded-lg border">
        {members.map((m) => (
          <li key={m.id}>
            <Link
              href={`/members/${m.id}`}
              className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 hover:bg-muted"
            >
              <span className="min-w-0">
                <span className="block font-medium">{m.name}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {m.email}
                </span>
              </span>
              <span className="shrink-0 text-sm text-muted-foreground">
                {m.roles.join(", ") || "no roles"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

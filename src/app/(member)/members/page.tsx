import { cn } from "cn";
import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { member } from "@/db/schema";
import { isPending } from "@/lib/member-rules";
import { knownRoles } from "@/lib/roles";
import { requireMember } from "@/lib/session";

import { approveAsPilot } from "./actions";

export const metadata: Metadata = { title: "Members · Flight Club" };

export default function MembersPage() {
  return (
    <div className="wide flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <Members />
      </Suspense>
    </div>
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
  const members = rows.map((m) => ({ ...m, roles: knownRoles(m.roles) }));

  const pending = members.filter(isPending);
  const active = members.filter((m) => m.active);
  const inactive = members.filter((m) => !m.active && !isPending(m));

  return (
    <>
      {pending.length > 0 && (
        <section
          aria-label="Waiting for approval"
          className="flex flex-col gap-2"
        >
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Waiting for approval
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border border-primary/30 bg-primary/5">
            {pending.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              >
                <Link href={`/members/${m.id}`} className="min-w-0">
                  <span className="block font-medium">{m.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {m.email}
                  </span>
                </Link>
                <form action={approveAsPilot.bind(null, m.id)}>
                  <Button type="submit" className="h-10 px-4 text-sm">
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

// Name and email stacked, roles beside them, on a phone; three columns
// under a header row on wider screens.
const COLUMNS =
  "md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)] md:gap-x-6";

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
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div
          aria-hidden
          className={cn(
            "hidden border-b bg-muted/50 px-4 py-2 text-sm text-muted-foreground md:grid",
            COLUMNS,
          )}
        >
          <span>Name</span>
          <span>Email</span>
          <span>Roles</span>
        </div>
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.id}>
              <Link
                href={`/members/${m.id}`}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 hover:bg-muted",
                  COLUMNS,
                )}
              >
                <span className="col-start-1 truncate font-medium">
                  {m.name}
                </span>
                <span className="col-start-1 truncate text-sm text-muted-foreground md:col-start-2 md:row-start-1 md:text-base">
                  {m.email}
                </span>
                <span className="col-start-2 row-span-2 row-start-1 flex flex-wrap justify-end gap-1 md:col-start-3 md:row-span-1 md:justify-start">
                  {m.roles.length > 0 ? (
                    m.roles.map((role) => (
                      <span
                        key={role}
                        className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground capitalize"
                      >
                        {role}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      no roles
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

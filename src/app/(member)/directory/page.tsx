import { asc, eq } from "drizzle-orm";
import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/page-skeleton";
import { db } from "@/db";
import { member } from "@/db/schema";
import { telHref } from "@/lib/contact";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Member directory · Flight Club" };

export default function DirectoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Member directory
        </h1>
        <p className="text-muted-foreground">
          How to reach other members. Change your own in Settings.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <Directory />
      </Suspense>
    </div>
  );
}

// Every active member's email and phone, for any active member: the club
// is small and its members fly the same aircraft.
async function Directory() {
  await requireMember();
  const members = await db()
    .select({
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
    })
    .from(member)
    .where(eq(member.active, true))
    .orderBy(asc(member.name));

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {members.map((m) => (
        <li
          key={m.id}
          aria-label={m.name}
          className="flex flex-col gap-1 px-4 py-3"
        >
          <span className="font-medium">{m.name}</span>
          <a
            href={`mailto:${m.email}`}
            className="flex min-h-8 items-center gap-2 text-sm break-all text-primary"
          >
            <Mail aria-hidden className="size-4 shrink-0" />
            {m.email}
          </a>
          {m.phone && (
            <a
              href={telHref(m.phone)}
              className="flex min-h-8 items-center gap-2 text-sm text-primary"
            >
              <Phone aria-hidden className="size-4 shrink-0" />
              {m.phone}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

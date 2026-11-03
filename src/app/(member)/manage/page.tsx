import { cn } from "cn";
import { BookOpen, ChevronRight, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { Suspense } from "react";

import { MANAGE_ICONS } from "@/components/manage-icons";
import { ListSkeleton } from "@/components/page-skeleton";
import { manageMenu } from "@/lib/manage";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Manage · Flight Club" };

// The Manage tab on phones, where the header's menu isn't shown: the
// same list, as a page.
export default function ManagePage() {
  return (
    <div className="wide flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Manage</h1>
      <Suspense fallback={<ListSkeleton rows={3} tall />}>
        <Manage />
      </Suspense>
    </div>
  );
}

async function Manage() {
  const member = await requireMember();
  const menu = await manageMenu(member);
  if (!menu) forbidden();

  return (
    <>
      <ul className="grid gap-3 md:grid-cols-3">
        {menu.links.map(({ href, icon, label, description, notOnPhones }) => {
          const Icon = MANAGE_ICONS[icon];
          return (
            <li
              key={href}
              // Too wide for a phone, like the pages it leads to.
              className={cn(notOnPhones && "hidden sm:block")}
            >
              <Link
                href={href}
                className="flex h-full flex-col gap-2 rounded-xl border bg-card p-5 hover:bg-muted"
              >
                <span className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="size-4 text-muted-foreground"
                  />
                </span>
                <span className="font-semibold">{label}</span>
                <span className="text-sm text-muted-foreground">
                  {description}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {menu.aircraft.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Your aircraft</h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {menu.aircraft.map((plane) => (
              <li
                key={plane.id}
                className="flex items-center justify-between gap-2 pl-4"
              >
                <span className="font-semibold">{plane.tailNumber}</span>
                <span className="flex">
                  <Link
                    href={`/aircraft/${plane.id}/maintenance`}
                    aria-label={`${plane.tailNumber} maintenance`}
                    className="flex h-12 items-center gap-2 px-4 text-sm font-medium text-primary hover:bg-muted"
                  >
                    <Wrench aria-hidden className="size-4" />
                    Maintenance
                  </Link>
                  <Link
                    href={`/aircraft/${plane.id}/flights`}
                    aria-label={`${plane.tailNumber} flights`}
                    className="flex h-12 items-center gap-2 px-4 text-sm font-medium text-primary hover:bg-muted"
                  >
                    <BookOpen aria-hidden className="size-4" />
                    Flights
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

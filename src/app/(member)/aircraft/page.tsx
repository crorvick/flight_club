import { cn } from "cn";
import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { aircraft } from "@/db/schema";
import { byMeterOrder } from "@/lib/meters";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Aircraft · Flight Club" };

export default function AircraftListPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Aircraft</h1>
      <Suspense fallback={<div className="h-96" />}>
        <AircraftList />
      </Suspense>
    </>
  );
}

async function AircraftList() {
  await requireMember("officer");
  const planes = await db().query.aircraft.findMany({
    orderBy: [asc(aircraft.tailNumber)],
    with: { meters: { columns: { kind: true, label: true } } },
  });

  return (
    <>
      <Link
        href="/aircraft/new"
        className={cn(buttonVariants(), "h-11 text-base")}
      >
        Add an aircraft
      </Link>
      <ul className="divide-y rounded-lg border">
        {planes.map((plane) => (
          <li key={plane.id}>
            <Link
              href={`/aircraft/${plane.id}`}
              className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 hover:bg-muted"
            >
              <span>
                <span className="block font-medium">
                  {plane.tailNumber}
                  {!plane.active && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      inactive
                    </span>
                  )}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {plane.makeModel}
                </span>
              </span>
              <span className="shrink-0 text-sm text-muted-foreground">
                {[...plane.meters]
                  .sort(byMeterOrder)
                  .map((m) => m.label)
                  .join(", ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

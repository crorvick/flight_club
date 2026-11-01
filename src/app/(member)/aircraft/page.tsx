import { cn } from "cn";
import { asc } from "drizzle-orm";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { aircraft } from "@/db/schema";
import { byMeterOrder } from "@/lib/meters";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Aircraft · Flight Club" };

export default function AircraftListPage() {
  return (
    <div className="wide flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Aircraft</h1>
        <Link
          href="/aircraft/new"
          className={cn(buttonVariants(), "h-10 gap-1.5 px-4")}
        >
          <Plus aria-hidden />
          Add an aircraft
        </Link>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <AircraftList />
      </Suspense>
    </div>
  );
}

async function AircraftList() {
  await requireMember("officer");
  const planes = await db().query.aircraft.findMany({
    orderBy: [asc(aircraft.tailNumber)],
    with: { meters: { columns: { kind: true, label: true } } },
  });

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div
        aria-hidden
        className={cn(
          "hidden border-b bg-muted/50 px-4 py-2 text-sm text-muted-foreground md:grid",
          COLUMNS,
        )}
      >
        <span>Tail number</span>
        <span>Make and model</span>
        <span>Meters</span>
      </div>
      <ul className="divide-y">
        {planes.map((plane) => (
          <li key={plane.id}>
            <Link
              href={`/aircraft/${plane.id}`}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 hover:bg-muted",
                COLUMNS,
              )}
            >
              <span className="col-start-1 font-medium">
                {plane.tailNumber}
                {!plane.active && (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    inactive
                  </span>
                )}
              </span>
              <span className="col-start-1 text-sm text-muted-foreground md:col-start-2 md:row-start-1 md:text-base md:text-foreground">
                {plane.makeModel}
              </span>
              <span className="col-start-2 row-span-2 row-start-1 text-sm text-muted-foreground md:col-start-3 md:row-span-1">
                {[...plane.meters]
                  .sort(byMeterOrder)
                  .map((m) => m.label)
                  .join(", ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Tail number and model stacked, meters beside them, on a phone; three
// columns under a header row on wider screens.
const COLUMNS =
  "md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] md:gap-x-6";

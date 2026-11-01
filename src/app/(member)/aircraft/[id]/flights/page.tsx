import { cn } from "cn";
import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { aircraft, flight, member } from "@/db/schema";
import { requireMaintainer } from "@/lib/captains";
import { formatDate } from "@/lib/dates";
import { formatHours, parseHours } from "@/lib/hours";
import { isUuid } from "@/lib/ids";
import { METER_LABELS } from "@/lib/meters";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Flights · Flight Club" };

// The most recent this many; older flights are rarely worth correcting.
const SHOWN = 100;

export default function AircraftFlightsPage({
  params,
}: PageProps<"/aircraft/[id]/flights">) {
  return (
    <Suspense fallback={<ListSkeleton title rows={8} />}>
      <Flights params={params} />
    </Suspense>
  );
}

async function Flights({
  params,
}: Pick<PageProps<"/aircraft/[id]/flights">, "params">) {
  await requireMember();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  // Officers, and this aircraft's captains.
  await requireMaintainer(id);

  const [plane] = await db()
    .select({ tailNumber: aircraft.tailNumber })
    .from(aircraft)
    .where(eq(aircraft.id, id));
  if (!plane) notFound();
  const flights = await db()
    .select({
      id: flight.id,
      date: flight.date,
      pilot: member.name,
      billedHours: flight.billedHours,
      billingMeterKind: flight.billingMeterKind,
    })
    .from(flight)
    .innerJoin(member, eq(member.id, flight.pilotId))
    .where(eq(flight.aircraftId, id))
    .orderBy(desc(flight.date), desc(flight.createdAt))
    .limit(SHOWN);

  return (
    <div className="wide flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {plane.tailNumber} flights
        </h1>
        <Link
          href={`/aircraft/${id}/flights/new`}
          className={cn(buttonVariants(), "h-10 gap-1.5 px-4")}
        >
          <Plus aria-hidden />
          Add a past flight
        </Link>
      </div>
      {flights.length === 0 ? (
        <p className="text-muted-foreground">No flights logged yet.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {flights.map((f) => (
            <li key={f.id}>
              <Link
                href={`/flights/${f.id}`}
                className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block font-medium">
                    {formatDate(f.date, { weekday: true })}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {f.pilot}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                  {formatHours(parseHours(f.billedHours)!)} h (
                  {METER_LABELS[f.billingMeterKind].toLowerCase()})
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {flights.length === SHOWN && (
        <p className="text-sm text-muted-foreground">
          Showing the latest {SHOWN} flights.
        </p>
      )}
    </div>
  );
}

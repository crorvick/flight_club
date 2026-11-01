import { cn } from "cn";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { canEditFlight } from "@/lib/flight-rules";
import { formatHours, parseHours } from "@/lib/hours";
import { METER_LABELS } from "@/lib/meters";
import { requireMember } from "@/lib/session";

import { getFlight } from "../data";

export const metadata: Metadata = { title: "Flight · Flight Club" };

const CONFIRMATIONS: Record<string, string> = {
  logged: "Flight logged.",
  updated: "Flight updated.",
};

export default function FlightPage({
  params,
  searchParams,
}: PageProps<"/flights/[id]">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <FlightDetails params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function FlightDetails({
  params,
  searchParams,
}: Pick<PageProps<"/flights/[id]">, "params" | "searchParams">) {
  const member = await requireMember();
  const { id } = await params;
  const { saved } = await searchParams;
  const flight = await getFlight(id);
  if (!flight) notFound();

  const confirmation = typeof saved === "string" && CONFIRMATIONS[saved];
  const editable = canEditFlight(flight, member.id);

  return (
    <>
      {confirmation && (
        <p
          role="status"
          className="rounded-lg border border-green-600/40 bg-green-600/10 p-4 font-semibold text-green-800 dark:text-green-300"
        >
          {confirmation}
        </p>
      )}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {flight.aircraft.tailNumber} on {flight.date}
        </h1>
        <p className="text-muted-foreground">{flight.pilot.name}</p>
      </div>

      <table className="w-full text-left tabular-nums">
        <thead className="text-sm text-muted-foreground">
          <tr>
            <th className="py-1 font-normal">Meter</th>
            <th className="py-1 text-right font-normal">Out</th>
            <th className="py-1 text-right font-normal">In</th>
            <th className="py-1 text-right font-normal">Hours</th>
          </tr>
        </thead>
        <tbody>
          {flight.readings.map((r) => {
            const out = parseHours(r.out)!;
            const inH = parseHours(r.in)!;
            return (
              <tr key={r.meterId} className="border-t">
                <td className="py-2">{r.label}</td>
                <td className="py-2 text-right">{formatHours(out)}</td>
                <td className="py-2 text-right">{formatHours(inH)}</td>
                <td className="py-2 text-right">{formatHours(inH - out)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <dt className="text-muted-foreground">Billed</dt>
        <dd className="tabular-nums">
          {formatHours(parseHours(flight.billedHours)!)} hours (
          {METER_LABELS[flight.billingMeterKind].toLowerCase()})
        </dd>
        <dt className="text-muted-foreground">Landings</dt>
        <dd>
          {flight.dayLandings} day, {flight.nightLandings} night
        </dd>
        {flight.notes && (
          <>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-wrap">{flight.notes}</dd>
          </>
        )}
      </dl>

      {editable ? (
        <Link
          href={`/flights/${flight.id}/edit`}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-11 text-base",
          )}
        >
          Edit flight
        </Link>
      ) : (
        flight.lockedAt && (
          <p className="text-sm text-muted-foreground">
            Locked: a later flight on {flight.aircraft.tailNumber} has been
            logged.
          </p>
        )
      )}
    </>
  );
}

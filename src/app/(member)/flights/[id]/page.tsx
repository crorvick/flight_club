import { cn } from "cn";
import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Flash } from "@/components/flash";
import { LocalTime } from "@/components/local-time";
import { DetailSkeleton } from "@/components/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { auditLog, member as memberTable } from "@/db/schema";
import { hasRole } from "@/lib/access";
import { canMaintainAircraft } from "@/lib/captains";
import { formatDate } from "@/lib/dates";
import { canEditFlight } from "@/lib/flight-rules";
import { formatAmount } from "@/lib/fluids";
import { formatHours, parseHours } from "@/lib/hours";
import { METER_LABELS } from "@/lib/meters";
import { requireMember } from "@/lib/session";

import { getFlight } from "../data";

export const metadata: Metadata = { title: "Flight · Flight Club" };

const CONFIRMATIONS: Record<string, string> = {
  logged: "Flight logged.",
  updated: "Flight updated.",
  corrected: "Flight corrected.",
  added: "Flight added.",
};

export default function FlightPage({
  params,
  searchParams,
}: PageProps<"/flights/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
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
  const editable = hasRole(member, "pilot") && canEditFlight(flight, member.id);
  // Officers, and the aircraft's captains, can correct any of its flights.
  const maintainer = await canMaintainAircraft(member, flight.aircraft.id);
  const officer = hasRole(member, "officer");

  // Officers' corrections, newest first.
  const corrections = await db()
    .select({
      id: auditLog.id,
      at: auditLog.createdAt,
      after: auditLog.after,
      by: memberTable.name,
    })
    .from(auditLog)
    .leftJoin(memberTable, eq(memberTable.id, auditLog.actorId))
    .where(
      and(eq(auditLog.entityType, "flight"), eq(auditLog.entityId, flight.id)),
    )
    .orderBy(desc(auditLog.createdAt));

  return (
    <>
      <Flash message={confirmation} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {flight.aircraft.tailNumber} on{" "}
          {formatDate(flight.date, { weekday: true })}
        </h1>
        <p className="text-muted-foreground">{flight.pilot.name}</p>
      </div>

      <section
        aria-label="Flight summary"
        className="overflow-hidden rounded-xl border bg-card"
      >
        <div className="px-5 pt-5 pb-4">
          <p className="text-sm text-muted-foreground">Billed</p>
          <p className="text-muted-foreground">
            <span className="text-4xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatHours(parseHours(flight.billedHours)!)}
            </span>{" "}
            hours ({METER_LABELS[flight.billingMeterKind].toLowerCase()})
          </p>
        </div>

        <table className="w-full border-t text-left tabular-nums">
          <thead className="bg-muted/50 text-sm text-muted-foreground">
            <tr>
              <th className="py-2 pl-5 font-normal">Meter</th>
              <th className="py-2 text-right font-normal">Out</th>
              <th className="py-2 text-right font-normal">In</th>
              <th className="py-2 pr-5 text-right font-normal">Hours</th>
            </tr>
          </thead>
          <tbody>
            {flight.readings.map((r) => {
              const out = parseHours(r.out)!;
              const inH = parseHours(r.in)!;
              return (
                <tr key={r.meterId} className="border-t">
                  <td className="py-2.5 pl-5">{r.label}</td>
                  <td className="py-2.5 text-right">{formatHours(out)}</td>
                  <td className="py-2.5 text-right">{formatHours(inH)}</td>
                  <td className="py-2.5 pr-5 text-right font-medium">
                    {formatHours(inH - out)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {(flight.fuelAdded !== null ||
          flight.oilAdded !== null ||
          flight.totalizerFuel !== null) && (
          <dl className="grid grid-cols-2 gap-4 border-t px-5 py-4 sm:grid-cols-3">
            {flight.fuelAdded !== null && (
              <div>
                <dt className="text-sm text-muted-foreground">Fuel added</dt>
                <dd className="font-medium tabular-nums">
                  {formatAmount(flight.fuelAdded, "gal")}
                </dd>
              </div>
            )}
            {flight.oilAdded !== null && (
              <div>
                <dt className="text-sm text-muted-foreground">Oil added</dt>
                <dd className="font-medium tabular-nums">
                  {formatAmount(flight.oilAdded, "qt")}
                </dd>
              </div>
            )}
            {flight.totalizerFuel !== null && (
              <div>
                <dt className="text-sm text-muted-foreground">
                  Totalizer at end
                </dt>
                <dd className="font-medium tabular-nums">
                  {formatAmount(flight.totalizerFuel, "gal")} remaining
                </dd>
              </div>
            )}
          </dl>
        )}

        {flight.notes && (
          <div className="border-t px-5 py-4">
            <p className="text-sm text-muted-foreground">Notes</p>
            <p className="whitespace-pre-wrap">{flight.notes}</p>
          </div>
        )}
      </section>

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
        <>
          {flight.lockedAt && (
            <p className="text-sm text-muted-foreground">
              Locked: {flight.aircraft.tailNumber} has flown since, so only an
              officer or its plane captain can change it.
            </p>
          )}
          {maintainer && (
            <Link
              href={`/flights/${flight.id}/edit`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-11 text-base",
              )}
            >
              Correct flight ({officer ? "officer" : "plane captain"})
            </Link>
          )}
        </>
      )}

      {corrections.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Corrections</h2>
          <ul className="flex flex-col gap-2">
            {corrections.map((c) => (
              <li key={c.id} className="rounded-lg bg-muted p-3 text-sm">
                <span className="text-muted-foreground">
                  {c.by ?? "A script"}, <LocalTime at={c.at} format="date" />:
                </span>{" "}
                {String((c.after as { reason?: string } | null)?.reason ?? "")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

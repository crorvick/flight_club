import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { Suspense } from "react";

import { AircraftStatusLabel } from "@/components/aircraft-status";
import { Flash } from "@/components/flash";
import { LocalTime } from "@/components/local-time";
import { FormSkeleton } from "@/components/page-skeleton";
import { db } from "@/db";
import { dispatch } from "@/db/schema";
import { hasRole } from "@/lib/access";
import { formatHours, parseHours } from "@/lib/hours";
import { isUuid } from "@/lib/ids";
import { byMeterOrder } from "@/lib/meters";
import { requireMember } from "@/lib/session";

import { FlightForm } from "../../flights/flight-form";
import { cancelDispatch, checkIn, reviewGap } from "../actions";
import { ActionButton } from "./action-button";
import { CancelCheckOut } from "./cancel-check-out";

export const metadata: Metadata = { title: "Checked out · Flight Club" };

export default function DispatchPage({
  params,
  searchParams,
}: PageProps<"/dispatches/[id]">) {
  return (
    <Suspense fallback={<FormSkeleton title fields={5} />}>
      <Dispatch params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Dispatch({
  params,
  searchParams,
}: Pick<PageProps<"/dispatches/[id]">, "params" | "searchParams">) {
  const member = await requireMember();
  const { id } = await params;
  const { saved } = await searchParams;
  if (!isUuid(id)) notFound();

  const row = await db().query.dispatch.findFirst({
    where: eq(dispatch.id, id),
    with: {
      aircraft: {
        columns: {
          tailNumber: true,
          billingMeterId: true,
          hasFuelTotalizer: true,
          engineCount: true,
        },
      },
      pilot: { columns: { name: true } },
      readings: { with: { meter: { columns: { label: true, kind: true } } } },
      acks: { with: { squawk: { columns: { description: true } } } },
    },
  });
  if (!row) notFound();
  const officer = hasRole(member, "officer");
  const mine = row.pilotId === member.id;
  if (!mine && !officer) forbidden();

  const tail = row.aircraft.tailNumber;
  const readings = row.readings
    .map((r) => ({
      meterId: r.meterId,
      label: r.meter.label,
      kind: r.meter.kind,
      out: r.out,
      gap: parseHours(r.out)! - parseHours(r.expected)!,
      expected: r.expected,
    }))
    .sort(byMeterOrder);
  const gaps = readings.filter((r) => r.gap > 0);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {row.status === "out"
            ? mine
              ? `You have ${tail}`
              : `${tail} is out with ${row.pilot.name}`
            : `${tail} with ${row.pilot.name}`}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          {row.vfrOnly && <AircraftStatusLabel status="vfr-only" />}
          <span>
            Checked out <LocalTime at={row.checkedOutAt} />
            {row.status === "cancelled" && " · cancelled"}
            {row.status === "in" && " · checked in"}
          </span>
        </p>
      </div>

      {gaps.length > 0 && (
        <div className="rounded-lg border border-amber-600/40 bg-amber-500/10 p-4">
          <p className="font-semibold text-amber-800 dark:text-amber-300">
            Unlogged time found at check-out
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {gaps.map((g) => (
              <li key={g.meterId}>
                {g.label}: logged {formatHours(parseHours(g.expected)!)}, read{" "}
                {formatHours(parseHours(g.out)!)} ({formatHours(g.gap)} hours)
              </li>
            ))}
          </ul>
          {row.gapReviewedAt ? (
            <p className="mt-2 text-sm">Reviewed by an officer.</p>
          ) : (
            officer && (
              <div className="mt-3">
                <ActionButton
                  action={reviewGap.bind(null, row.id)}
                  label="Mark reviewed"
                  pendingLabel="Saving…"
                />
              </div>
            )
          )}
        </div>
      )}

      {row.acks.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="font-semibold">Squawks acknowledged</h2>
          <ul className="list-disc pl-5 text-sm">
            {row.acks.map((a) => (
              <li key={a.squawkId}>{a.squawk.description}</li>
            ))}
          </ul>
        </section>
      )}

      <Flash message={saved === "reviewed" && "Marked reviewed."} />

      {row.status === "out" ? (
        <>
          <FlightForm
            action={checkIn.bind(null, row.id)}
            meters={readings.map((r) => ({
              id: r.meterId,
              label: r.label,
              out: r.out,
              billing: r.meterId === row.aircraft.billingMeterId,
            }))}
            fluids={{
              totalizer: row.aircraft.hasFuelTotalizer,
              engines: row.aircraft.engineCount,
            }}
            submitLabel={`Check in ${tail}`}
            pendingLabel="Checking in…"
            offerSquawk
          />
          <CancelCheckOut
            action={cancelDispatch.bind(null, row.id)}
            tailNumber={tail}
          />
        </>
      ) : (
        row.flightId && (
          <Link href={`/flights/${row.flightId}`} className="underline">
            View the flight
          </Link>
        )
      )}
    </>
  );
}

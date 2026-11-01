import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AircraftPicker } from "@/components/aircraft-picker";
import { listActiveAircraft } from "@/lib/fleet";
import { isUuid } from "@/lib/ids";
import { requireMember } from "@/lib/session";

import { lastFlownAircraftId } from "../../flights/data";
import { reportSquawk } from "../actions";
import { SquawkForm } from "../squawk-form";

export const metadata: Metadata = { title: "Report a squawk · Flight Club" };

export default function NewSquawkPage({
  searchParams,
}: PageProps<"/squawks/new">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <ReportSquawk searchParams={searchParams} />
    </Suspense>
  );
}

async function ReportSquawk({
  searchParams,
}: Pick<PageProps<"/squawks/new">, "searchParams">) {
  const member = await requireMember("pilot");
  const fleet = await listActiveAircraft();
  if (fleet.length === 0) {
    return <p>There are no aircraft yet. An officer needs to add them.</p>;
  }

  // Coming from a flight, the aircraft is already chosen and the flight
  // just logged gets a confirmation here instead of its own page.
  const { aircraft: requested, flight } = await searchParams;
  const candidates = [
    typeof requested === "string" ? requested : undefined,
    await lastFlownAircraftId(member.id),
  ];
  const plane =
    candidates
      .map((id) => fleet.find((a) => a.id === id))
      .find((a) => a !== undefined) ?? fleet[0];
  const loggedFlight =
    typeof flight === "string" && isUuid(flight) ? flight : undefined;

  return (
    <>
      {loggedFlight && (
        <p
          role="status"
          className="rounded-lg border border-green-600/40 bg-green-600/10 p-4 font-semibold text-green-800 dark:text-green-300"
        >
          Flight logged.{" "}
          <Link href={`/flights/${loggedFlight}`} className="underline">
            View it
          </Link>
        </p>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">Report a squawk</h1>
      {!loggedFlight && (
        <AircraftPicker
          fleet={fleet}
          selectedId={plane.id}
          path="/squawks/new"
        />
      )}
      <SquawkForm
        key={plane.id}
        action={reportSquawk.bind(null, plane.id)}
        tailNumber={plane.tailNumber}
      />
    </>
  );
}

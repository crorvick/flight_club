import type { Metadata } from "next";
import { Suspense } from "react";

import { AircraftPicker } from "@/components/aircraft-picker";
import { PreflightWarnings } from "@/components/preflight-warnings";
import { listActiveAircraft } from "@/lib/fleet";
import { requireMember } from "@/lib/session";

import { logFlight } from "../actions";
import { getAircraftForLog, lastFlownAircraftId } from "../data";
import { FlightForm } from "../flight-form";

export const metadata: Metadata = { title: "Log a flight · Flight Club" };

export default function NewFlightPage({
  searchParams,
}: PageProps<"/flights/new">) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Log a flight</h1>
      {/* Reads the session and the URL, so it streams in after the shell. */}
      <Suspense fallback={<div className="h-96" />}>
        <LogFlight searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function LogFlight({
  searchParams,
}: Pick<PageProps<"/flights/new">, "searchParams">) {
  const member = await requireMember("pilot");
  const fleet = await listActiveAircraft();
  if (fleet.length === 0) {
    return <p>There are no aircraft yet. An officer needs to add them.</p>;
  }

  // The aircraft in the URL if it's a real one, else the one this pilot
  // flew last, else the first.
  const { aircraft: requested } = await searchParams;
  const candidates = [
    typeof requested === "string" ? requested : undefined,
    await lastFlownAircraftId(member.id),
  ];
  const selectedId =
    candidates.find((id) => fleet.some((a) => a.id === id)) ?? fleet[0].id;
  const plane = (await getAircraftForLog(selectedId))!;

  return (
    <>
      <AircraftPicker fleet={fleet} selectedId={plane.id} path="/flights/new" />

      <PreflightWarnings tailNumber={plane.tailNumber} alerts={plane.alerts} />

      {/* Keyed so switching aircraft starts with a fresh form. */}
      <FlightForm
        key={plane.id}
        action={logFlight.bind(null, plane.id)}
        meters={plane.meters.map((m) => ({
          id: m.id,
          label: m.label,
          out: m.reading,
          billing: m.billing,
        }))}
        sendOuts
        offerSquawk
        submitLabel={`Log flight in ${plane.tailNumber}`}
        pendingLabel="Logging…"
      />
    </>
  );
}

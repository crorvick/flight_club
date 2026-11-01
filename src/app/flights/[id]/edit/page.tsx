import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { Suspense } from "react";

import { canEditFlight } from "@/lib/flight-rules";
import { formatHours, parseHours } from "@/lib/hours";
import { requireMember } from "@/lib/session";

import { updateFlight } from "../../actions";
import { getFlight } from "../../data";
import { FlightForm } from "../../flight-form";

export const metadata: Metadata = { title: "Edit flight · Flight Club" };

export default function EditFlightPage({
  params,
}: PageProps<"/flights/[id]/edit">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <EditFlight params={params} />
    </Suspense>
  );
}

async function EditFlight({
  params,
}: Pick<PageProps<"/flights/[id]/edit">, "params">) {
  const member = await requireMember("pilot");
  const { id } = await params;
  const flight = await getFlight(id);
  if (!flight) notFound();
  if (flight.pilotId !== member.id) forbidden();

  const title = (
    <h1 className="text-2xl font-semibold tracking-tight">
      Edit {flight.aircraft.tailNumber} on {flight.date}
    </h1>
  );

  if (!canEditFlight(flight, member.id)) {
    return (
      <>
        {title}
        <p>
          This flight was locked when the next flight on{" "}
          {flight.aircraft.tailNumber} was logged. Ask an officer to change it.
        </p>
        <Link href={`/flights/${flight.id}`} className="underline">
          Back to the flight
        </Link>
      </>
    );
  }

  return (
    <>
      {title}
      <FlightForm
        action={updateFlight.bind(null, flight.id)}
        meters={flight.readings.map((r) => ({
          id: r.meterId,
          label: r.label,
          out: r.out,
          billing: r.kind === flight.billingMeterKind,
        }))}
        sendOuts={false}
        initial={{
          date: flight.date,
          dayLandings: flight.dayLandings,
          nightLandings: flight.nightLandings,
          notes: flight.notes ?? "",
          ins: Object.fromEntries(
            flight.readings.map((r) => [
              r.meterId,
              formatHours(parseHours(r.in)!),
            ]),
          ),
        }}
        submitLabel="Save changes"
        pendingLabel="Saving…"
      />
    </>
  );
}

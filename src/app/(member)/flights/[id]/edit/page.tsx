import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/page-skeleton";
import { hasRole } from "@/lib/access";
import { canMaintainAircraft } from "@/lib/captains";
import { formatDate } from "@/lib/dates";
import { canEditFlight } from "@/lib/flight-rules";
import { formatHours, parseHours } from "@/lib/hours";
import { requireMember } from "@/lib/session";

import { officerUpdateFlight, updateFlight } from "../../actions";
import { fluidSetup, fluidValues, getFlight, pilotChoices } from "../../data";
import { FlightForm } from "../../flight-form";
import { OfficerFlightForm } from "./officer-flight-form";

export const metadata: Metadata = { title: "Edit flight · Flight Club" };

export default function EditFlightPage({
  params,
}: PageProps<"/flights/[id]/edit">) {
  return (
    <Suspense fallback={<FormSkeleton title fields={5} />}>
      <EditFlight params={params} />
    </Suspense>
  );
}

async function EditFlight({
  params,
}: Pick<PageProps<"/flights/[id]/edit">, "params">) {
  const member = await requireMember();
  const { id } = await params;
  const flight = await getFlight(id);
  if (!flight) notFound();

  const title = (
    <h1 className="text-2xl font-semibold tracking-tight">
      Edit {flight.aircraft.tailNumber} on {formatDate(flight.date)}
    </h1>
  );

  // A pilot's own, still unlocked flight gets the pilot's form, even for
  // an officer: nothing about it needs auditing yet.
  const ownUnlocked =
    hasRole(member, "pilot") && canEditFlight(flight, member.id);
  if (!ownUnlocked && (await canMaintainAircraft(member, flight.aircraft.id))) {
    return (
      <OfficerCorrection
        flight={flight}
        asOfficer={hasRole(member, "officer")}
      />
    );
  }
  if (flight.pilotId !== member.id) forbidden();

  if (!ownUnlocked) {
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
        initial={{
          date: flight.date,
          notes: flight.notes ?? "",
          ins: Object.fromEntries(
            flight.readings.map((r) => [
              r.meterId,
              formatHours(parseHours(r.in)!),
            ]),
          ),
          ...fluidValues(flight),
        }}
        fluids={fluidSetup(flight)}
        submitLabel="Save changes"
        pendingLabel="Saving…"
      />
    </>
  );
}

// For officers, and the aircraft's captains.
async function OfficerCorrection({
  flight,
  asOfficer,
}: {
  flight: NonNullable<Awaited<ReturnType<typeof getFlight>>>;
  asOfficer: boolean;
}) {
  const pilots = await pilotChoices(flight.pilotId);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Correct {flight.aircraft.tailNumber} on {formatDate(flight.date)}
        </h1>
        <p className="text-muted-foreground">
          {asOfficer
            ? "As an officer."
            : `As ${flight.aircraft.tailNumber}'s plane captain.`}{" "}
          The change and your reason are recorded.
        </p>
      </div>
      <OfficerFlightForm
        action={officerUpdateFlight.bind(null, flight.id)}
        pilots={pilots}
        flight={{
          pilotId: flight.pilotId,
          date: flight.date,
          notes: flight.notes ?? "",
          ...fluidValues(flight),
        }}
        fluids={fluidSetup(flight)}
        readings={flight.readings}
        meterNote="The flights before and after this one aren't changed. If a reading was carried into the next flight, correct that one too."
        reasonLabel="Reason for the correction"
        submitLabel="Save correction"
      />
    </>
  );
}

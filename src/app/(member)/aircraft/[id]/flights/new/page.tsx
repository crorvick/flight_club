import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/page-skeleton";
import { db } from "@/db";
import { aircraft } from "@/db/schema";
import { requireMaintainer } from "@/lib/captains";
import { formatHours, parseHours } from "@/lib/hours";
import { isUuid } from "@/lib/ids";
import { byMeterOrder } from "@/lib/meters";
import { requireMember } from "@/lib/session";

import { addPastFlight } from "../../../../flights/actions";
import { OfficerFlightForm } from "../../../../flights/[id]/edit/officer-flight-form";
import { pilotChoices } from "../../../../flights/data";

export const metadata: Metadata = { title: "Add a past flight · Flight Club" };

export default function NewPastFlightPage({
  params,
}: PageProps<"/aircraft/[id]/flights/new">) {
  return (
    <Suspense fallback={<FormSkeleton title fields={6} />}>
      <NewPastFlight params={params} />
    </Suspense>
  );
}

async function NewPastFlight({
  params,
}: Pick<PageProps<"/aircraft/[id]/flights/new">, "params">) {
  await requireMember();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  // Officers, and this aircraft's captains.
  await requireMaintainer(id);

  const plane = await db().query.aircraft.findFirst({
    where: eq(aircraft.id, id),
    columns: {
      id: true,
      tailNumber: true,
      hasFuelTotalizer: true,
      engineCount: true,
    },
    with: { meters: true },
  });
  if (!plane) notFound();
  const meters = [...plane.meters].sort(byMeterOrder);
  const now = meters
    .map((m) => `${m.label} ${formatHours(parseHours(m.currentReading)!)}`)
    .join(", ");

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Add a past flight to {plane.tailNumber}
        </h1>
        <p className="text-muted-foreground">
          For a flight that wasn&apos;t logged at the time. It&apos;s recorded
          with who added it and why.
        </p>
      </div>
      <OfficerFlightForm
        action={addPastFlight.bind(null, plane.id)}
        pilots={await pilotChoices()}
        flight={{
          pilotId: "",
          date: "",
          notes: "",
          fuelAdded: "",
          oilAdded: "",
          oilAdded2: "",
          totalizerFuel: "",
        }}
        fluids={{
          totalizer: plane.hasFuelTotalizer,
          engines: plane.engineCount,
        }}
        readings={meters.map((m) => ({
          meterId: m.id,
          label: m.label,
          out: "",
          in: "",
        }))}
        meterNote={`The meters now read ${now}. A flight starting there or later moves them on; an earlier one is kept as history and leaves them as they are.`}
        reasonLabel="Where it comes from"
        submitLabel="Add flight"
      />
    </>
  );
}

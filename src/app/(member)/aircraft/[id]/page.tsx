import { eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Flash } from "@/components/flash";
import { FormSkeleton } from "@/components/page-skeleton";
import { db } from "@/db";
import { aircraft, flightMeterReading, maintenanceItem } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { byMeterOrder, METER_DISPLAY_ORDER } from "@/lib/meters";
import { requireMember } from "@/lib/session";

import { addMeter, removeMeter, updateAircraft, updateMeter } from "../actions";
import { AddMeterForm, DetailsForm, MeterForm } from "../aircraft-forms";

export const metadata: Metadata = { title: "Aircraft · Flight Club" };

const CONFIRMATIONS: Record<string, string> = {
  created: "Aircraft added.",
  details: "Details saved.",
  meter: "Meters saved.",
};

export default function AircraftPage({
  params,
  searchParams,
}: PageProps<"/aircraft/[id]">) {
  return (
    <Suspense fallback={<FormSkeleton title fields={5} />}>
      <AircraftDetails params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function AircraftDetails({
  params,
  searchParams,
}: Pick<PageProps<"/aircraft/[id]">, "params" | "searchParams">) {
  await requireMember("officer");
  const { id } = await params;
  const { saved } = await searchParams;
  if (!isUuid(id)) notFound();

  const plane = await db().query.aircraft.findFirst({
    where: eq(aircraft.id, id),
    with: { meters: true },
  });
  if (!plane) notFound();
  const meters = [...plane.meters].sort(byMeterOrder);

  // Meters flights have recorded, or maintenance is counted on, can't be
  // removed.
  const meterIds = meters.map((m) => m.id);
  const used = new Set(
    meterIds.length === 0
      ? []
      : [
          ...(await db()
            .selectDistinct({ meterId: flightMeterReading.meterId })
            .from(flightMeterReading)
            .where(inArray(flightMeterReading.meterId, meterIds))),
          ...(await db()
            .selectDistinct({ meterId: maintenanceItem.meterId })
            .from(maintenanceItem)
            .where(inArray(maintenanceItem.meterId, meterIds))),
        ].map((r) => r.meterId),
  );
  const confirmation = typeof saved === "string" && CONFIRMATIONS[saved];
  // A save redirects back here; keying on the stored values makes the
  // forms show them rather than what was typed.
  const version = plane.updatedAt.getTime();

  return (
    <>
      <Flash message={confirmation} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {plane.tailNumber}
        </h1>
        <Link
          href={`/aircraft/${plane.id}/maintenance`}
          className="text-sm underline"
        >
          Maintenance items
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Details</h2>
        <DetailsForm
          key={version}
          action={updateAircraft.bind(null, plane.id)}
          aircraft={plane}
          meters={meters.map((m) => ({ id: m.id, label: m.label }))}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Meters</h2>
        {meters.map((m) => (
          <MeterForm
            key={`${m.id}-${m.updatedAt.getTime()}`}
            action={updateMeter.bind(null, m.id)}
            removeAction={removeMeter.bind(null, m.id)}
            meter={{ id: m.id, label: m.label, reading: m.currentReading }}
            removable={!used.has(m.id) && m.id !== plane.billingMeterId}
          />
        ))}
        <AddMeterForm
          key={meters.length}
          action={addMeter.bind(null, plane.id)}
          kinds={METER_DISPLAY_ORDER.filter(
            (k) => !meters.some((m) => m.kind === k),
          )}
        />
      </section>
    </>
  );
}

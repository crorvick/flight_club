import { cn } from "cn";
import { eq, inArray } from "drizzle-orm";
import { Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Flash } from "@/components/flash";
import { FormSkeleton } from "@/components/page-skeleton";
import { SectionCard } from "@/components/section-card";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { aircraft, flightMeterReading } from "@/db/schema";
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

  // Meters flights have recorded can't be removed, nor can the ones it's
  // billed by and its logbook time.
  const meterIds = meters.map((m) => m.id);
  const used = new Set(
    meterIds.length === 0
      ? []
      : (
          await db()
            .selectDistinct({ meterId: flightMeterReading.meterId })
            .from(flightMeterReading)
            .where(inArray(flightMeterReading.meterId, meterIds))
        ).map((r) => r.meterId),
  );
  used.add(plane.billingMeterId!);
  used.add(plane.logbookMeterId!);
  const confirmation = typeof saved === "string" && CONFIRMATIONS[saved];
  // A save redirects back here; keying on the stored values makes the
  // forms show them rather than what was typed.
  const version = plane.updatedAt.getTime();

  return (
    <div className="wide flex flex-col gap-6">
      <Flash message={confirmation} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {plane.tailNumber}
          </h1>
          <p className="text-muted-foreground">{plane.makeModel}</p>
        </div>
        <Link
          href={`/aircraft/${plane.id}/maintenance`}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-10 gap-1.5 px-4",
          )}
        >
          <Wrench aria-hidden />
          Maintenance items
        </Link>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <SectionCard title="Details">
          <DetailsForm
            key={version}
            action={updateAircraft.bind(null, plane.id)}
            aircraft={plane}
            meters={meters.map((m) => ({ id: m.id, label: m.label }))}
          />
        </SectionCard>

        <SectionCard
          title="Meters"
          aria-label="Meters"
          description="Correct a reading only to fix a mistake; flights move them on their own."
        >
          <div className="flex flex-col gap-2">
            {meters.map((m) => (
              <MeterForm
                key={`${m.id}-${m.updatedAt.getTime()}`}
                action={updateMeter.bind(null, m.id)}
                removeAction={removeMeter.bind(null, m.id)}
                meter={{ id: m.id, label: m.label, reading: m.currentReading }}
                billing={m.id === plane.billingMeterId}
                logbook={m.id === plane.logbookMeterId}
                removable={!used.has(m.id)}
              />
            ))}
          </div>
          <AddMeterForm
            key={meters.length}
            action={addMeter.bind(null, plane.id)}
            kinds={METER_DISPLAY_ORDER.filter(
              (k) => !meters.some((m) => m.kind === k),
            )}
          />
        </SectionCard>
      </div>
    </div>
  );
}

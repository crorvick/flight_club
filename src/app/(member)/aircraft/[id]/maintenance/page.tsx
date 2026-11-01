import { cn } from "cn";
import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Flash } from "@/components/flash";
import { ListSkeleton } from "@/components/page-skeleton";
import { SectionCard } from "@/components/section-card";
import { db } from "@/db";
import { aircraft, maintenanceItem } from "@/db/schema";
import { today } from "@/lib/fleet";
import { isUuid } from "@/lib/ids";
import { describeDue, maintenanceStatus } from "@/lib/maintenance";
import { requireMember } from "@/lib/session";

import { createItem } from "../../../maintenance/actions";
import { ItemForm } from "../../../maintenance/maintenance-forms";

export const metadata: Metadata = { title: "Maintenance · Flight Club" };

const STATE_LABELS = { ok: "OK", "due-soon": "Due soon", overdue: "Overdue" };

export default function AircraftMaintenancePage({
  params,
  searchParams,
}: PageProps<"/aircraft/[id]/maintenance">) {
  return (
    <Suspense fallback={<ListSkeleton title />}>
      <Maintenance params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Maintenance({
  params,
  searchParams,
}: Pick<PageProps<"/aircraft/[id]/maintenance">, "params" | "searchParams">) {
  await requireMember("officer");
  const { id } = await params;
  const { saved } = await searchParams;
  if (!isUuid(id)) notFound();

  const plane = await db().query.aircraft.findFirst({
    where: eq(aircraft.id, id),
    columns: { id: true, tailNumber: true },
    with: {
      // Hours intervals count on it.
      logbookMeter: { columns: { label: true, currentReading: true } },
      maintenanceItems: { orderBy: asc(maintenanceItem.name) },
    },
  });
  if (!plane) notFound();
  const date = today();

  return (
    <>
      <Flash message={saved === "deleted" && "Item removed."} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {plane.tailNumber} maintenance
        </h1>
        <Link href={`/aircraft/${plane.id}`} className="text-sm underline">
          Aircraft and meters
        </Link>
      </div>

      {plane.maintenanceItems.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {plane.maintenanceItems.map((item) => {
            const status = maintenanceStatus(
              {
                ...item,
                currentReading: plane.logbookMeter?.currentReading ?? null,
              },
              date,
            );
            return (
              <li key={item.id}>
                <Link
                  href={`/maintenance/${item.id}`}
                  className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 hover:bg-muted"
                >
                  <span>
                    <span className="block font-medium">{item.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {describeDue(status, plane.logbookMeter?.label)}
                      {
                        {
                          all: "",
                          ifr: " · grounds for IFR",
                          none: " · warns only",
                        }[item.grounding]
                      }
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-medium",
                      status.state === "overdue" && "text-destructive",
                      status.state === "due-soon" &&
                        "text-amber-700 dark:text-amber-400",
                      status.state === "ok" && "text-muted-foreground",
                    )}
                  >
                    {STATE_LABELS[status.state]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <SectionCard title="Add an item">
        <ItemForm
          key={plane.maintenanceItems.length}
          action={createItem.bind(null, plane.id)}
          logbookMeter={plane.logbookMeter?.label}
          submitLabel="Add item"
        />
      </SectionCard>
    </>
  );
}

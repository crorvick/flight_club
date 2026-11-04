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
import { hasRole } from "@/lib/access";
import { requireMaintainer } from "@/lib/captains";
import { today } from "@/lib/fleet";
import { cycleChoice } from "@/lib/airac";
import { isUuid } from "@/lib/ids";
import { describeDue, maintenanceStatus } from "@/lib/maintenance";
import { itemTitle } from "@/lib/maintenance-kinds";
import { requireMember } from "@/lib/session";

import { createItem } from "../../../maintenance/actions";
import { ItemForm } from "../../../maintenance/maintenance-forms";

export const metadata: Metadata = { title: "Maintenance · Flight Club" };

const STATE_LABELS = {
  ok: "OK",
  "due-soon": "Due soon",
  overdue: "Overdue",
  closed: "Closed",
};

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
  await requireMember();
  const { id } = await params;
  const { saved } = await searchParams;
  if (!isUuid(id)) notFound();
  // Officers, and this aircraft's captains.
  const member = await requireMaintainer(id);

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
  const items = plane.maintenanceItems.map((item) => ({
    ...item,
    status: maintenanceStatus(
      { ...item, currentReading: plane.logbookMeter?.currentReading ?? null },
      date,
    ),
  }));
  // Done for good, or not applicable: kept for the record, out of the way.
  const open = items.filter((i) => i.status.state !== "closed");
  const closed = items.filter((i) => i.status.state === "closed");

  return (
    <>
      <Flash message={saved === "deleted" && "Item removed."} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {plane.tailNumber} maintenance
        </h1>
        {hasRole(member, "officer") && (
          <Link href={`/aircraft/${plane.id}`} className="text-sm underline">
            Aircraft and meters
          </Link>
        )}
      </div>

      {open.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {open.map(({ status, ...item }) => (
            <li key={item.id}>
              <Link
                href={`/maintenance/${item.id}`}
                className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 hover:bg-muted"
              >
                <span>
                  <span className="block font-medium">{itemTitle(item)}</span>
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
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <SectionCard title="Done and not applicable">
          <ul className="flex flex-col gap-1">
            {closed.map(({ status, ...item }) => (
              <li key={item.id}>
                <Link
                  href={`/maintenance/${item.id}`}
                  className="flex min-h-11 flex-col justify-center rounded-lg px-2 py-1 hover:bg-muted"
                >
                  <span className="font-medium">{itemTitle(item)}</span>
                  <span className="text-sm text-muted-foreground">
                    {describeDue(status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard title="Add an item">
        <ItemForm
          key={plane.maintenanceItems.length}
          action={createItem.bind(null, plane.id)}
          logbookMeter={plane.logbookMeter?.label}
          cycles={cycleChoice(date)}
          submitLabel="Add item"
        />
      </SectionCard>
    </>
  );
}

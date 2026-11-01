import { cn } from "cn";
import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Flash } from "@/components/flash";
import { DetailSkeleton } from "@/components/page-skeleton";
import { db } from "@/db";
import { maintenanceCompletion, maintenanceItem } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { today } from "@/lib/fleet";
import { formatHours, parseHours } from "@/lib/hours";
import { isUuid } from "@/lib/ids";
import { describeDue, maintenanceStatus } from "@/lib/maintenance";
import { byMeterOrder } from "@/lib/meters";
import { requireMember } from "@/lib/session";

import { completeItem, deleteItem, updateItem } from "../actions";
import { CompletionForm, DeleteItemForm, ItemForm } from "../maintenance-forms";

export const metadata: Metadata = { title: "Maintenance item · Flight Club" };

const CONFIRMATIONS: Record<string, string> = {
  created: "Item added.",
  updated: "Item saved.",
  completed: "Completion logged.",
};

export default function MaintenanceItemPage({
  params,
  searchParams,
}: PageProps<"/maintenance/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ItemDetails params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ItemDetails({
  params,
  searchParams,
}: Pick<PageProps<"/maintenance/[id]">, "params" | "searchParams">) {
  await requireMember("officer");
  const { id } = await params;
  const { saved } = await searchParams;
  if (!isUuid(id)) notFound();

  const item = await db().query.maintenanceItem.findFirst({
    where: eq(maintenanceItem.id, id),
    with: {
      meter: { columns: { label: true, currentReading: true } },
      aircraft: {
        columns: { id: true, tailNumber: true },
        with: { meters: { columns: { id: true, kind: true, label: true } } },
      },
      completions: {
        orderBy: desc(maintenanceCompletion.completedOn),
        with: { recordedBy: { columns: { name: true } } },
      },
    },
  });
  if (!item) notFound();

  const status = maintenanceStatus(
    { ...item, currentReading: item.meter?.currentReading ?? null },
    today(),
  );
  const confirmation = typeof saved === "string" && CONFIRMATIONS[saved];
  const meters = [...item.aircraft.meters].sort(byMeterOrder);

  return (
    <>
      <Flash message={confirmation} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
        <Link
          href={`/aircraft/${item.aircraft.id}/maintenance`}
          className="text-sm underline"
        >
          {item.aircraft.tailNumber} maintenance
        </Link>
      </div>

      <p
        className={cn(
          "rounded-lg p-4 font-medium",
          status.state === "overdue" && "bg-destructive/10 text-destructive",
          status.state === "due-soon" &&
            "bg-amber-500/10 text-amber-800 dark:text-amber-300",
          status.state === "ok" && "bg-muted",
        )}
      >
        {status.state === "overdue"
          ? {
              all: "Overdue: the aircraft is grounded",
              ifr: "Overdue: the aircraft is VFR only",
              none: "Overdue",
            }[item.grounding]
          : status.state === "due-soon"
            ? "Due soon"
            : "Not due yet"}
        <span className="block text-sm font-normal">
          {describeDue(status, item.meter?.label)}
        </span>
      </p>

      <CompletionForm
        key={`${item.lastCompletedOn}-${item.lastCompletedReading}`}
        action={completeItem.bind(null, item.id)}
        meterLabel={item.meter?.label}
        currentReading={item.meter?.currentReading}
      />

      {item.completions.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">History</h2>
          <ul className="flex flex-col gap-2">
            {item.completions.map((c) => (
              <li key={c.id} className="rounded-lg bg-muted p-3 text-sm">
                <span className="font-medium">{formatDate(c.completedOn)}</span>
                {c.reading !== null && (
                  <> at {formatHours(parseHours(c.reading)!)}</>
                )}
                <span className="text-muted-foreground">
                  {" "}
                  · {c.recordedBy?.name ?? "unknown"}
                </span>
                {c.note && <p className="mt-1 whitespace-pre-wrap">{c.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Edit</h2>
        <ItemForm
          key={item.updatedAt.getTime()}
          action={updateItem.bind(null, item.id)}
          meters={meters.map((m) => ({ id: m.id, label: m.label }))}
          item={item}
          submitLabel="Save item"
        />
        <DeleteItemForm action={deleteItem.bind(null, item.id)} />
      </section>
    </>
  );
}

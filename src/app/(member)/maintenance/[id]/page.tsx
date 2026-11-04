import { cn } from "cn";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";

import { Flash } from "@/components/flash";
import { DetailSkeleton } from "@/components/page-skeleton";
import { SectionCard } from "@/components/section-card";
import { db } from "@/db";
import { maintenanceCompletion, maintenanceItem } from "@/db/schema";
import { cycleChoice } from "@/lib/airac";
import { requireMaintainer } from "@/lib/captains";
import { formatDate } from "@/lib/dates";
import { today } from "@/lib/fleet";
import { formatHours, parseHours } from "@/lib/hours";
import { isUuid } from "@/lib/ids";
import { describeDue, maintenanceStatus } from "@/lib/maintenance";
import {
  describeDetails,
  isDirective,
  itemTitle,
  KIND_LABELS,
  KIND_REGULATIONS,
  SCOPE_LABELS,
} from "@/lib/maintenance-kinds";
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
  await requireMember();
  const { id } = await params;
  const { saved } = await searchParams;
  if (!isUuid(id)) notFound();

  const item = await db().query.maintenanceItem.findFirst({
    where: eq(maintenanceItem.id, id),
    with: {
      aircraft: {
        columns: { id: true, tailNumber: true, engineCount: true },
        // Hours intervals count on it.
        with: {
          logbookMeter: { columns: { label: true, currentReading: true } },
        },
      },
      completions: {
        orderBy: desc(maintenanceCompletion.completedOn),
        with: { recordedBy: { columns: { name: true } } },
      },
    },
  });
  if (!item) notFound();
  // Officers, and the aircraft's captains.
  await requireMaintainer(item.aircraft.id);

  const logbook = item.aircraft.logbookMeter;
  const hours = item.intervalHours !== null || item.dueReading !== null;
  const date = today();
  const cycles = cycleChoice(date);
  const status = maintenanceStatus(
    { ...item, currentReading: logbook?.currentReading ?? null },
    date,
  );
  const confirmation = typeof saved === "string" && CONFIRMATIONS[saved];
  const lastOilType =
    item.kind === "oil_change"
      ? await lastOilTypeOn(item.aircraft.id)
      : undefined;
  const regulation = KIND_REGULATIONS[item.kind];
  const kindLine = [
    item.kind !== "general" &&
      KIND_LABELS[item.kind] !== item.name &&
      KIND_LABELS[item.kind],
    isDirective(item.kind) && item.appliesTo && SCOPE_LABELS[item.appliesTo],
    regulation && (
      <a
        href={regulation.url}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {regulation.cite}
      </a>
    ),
  ].filter(Boolean);

  return (
    <>
      <Flash message={confirmation} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {itemTitle(item)}
        </h1>
        {/* The kind, unless the name already says it, and its rule. */}
        {kindLine.length > 0 && (
          <p className="text-muted-foreground">
            {kindLine.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && " · "}
                {part}
              </Fragment>
            ))}
          </p>
        )}
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
          (status.state === "ok" || status.state === "closed") && "bg-muted",
        )}
      >
        {status.state === "closed"
          ? status.notApplicable
            ? "Not applicable"
            : "Done for good"
          : status.state === "overdue"
            ? {
                all: "Overdue: the aircraft is grounded",
                ifr: "Overdue: the aircraft is VFR only",
                none: "Overdue",
              }[item.grounding]
            : status.state === "due-soon"
              ? "Due soon"
              : "Not due yet"}
        <span className="block text-sm font-normal">
          {status.notApplicable ?? describeDue(status, logbook?.label)}
        </span>
        {item.kind === "hundred_hour" && status.state === "overdue" && (
          <span className="block text-sm font-normal">
            It may be flown up to 10 hours over only to reach a place where it
            can be done.
          </span>
        )}
      </p>

      {status.state !== "closed" && (
        <CompletionForm
          key={`${item.lastCompletedOn}-${item.lastCompletedReading}-${item.dueOn}`}
          action={completeItem.bind(null, item.id)}
          kind={item.kind}
          schedule={item.schedule}
          cycles={cycles}
          engines={item.aircraft.engineCount}
          lastOilType={lastOilType}
          meterLabel={hours ? logbook?.label : undefined}
          currentReading={hours ? logbook?.currentReading : undefined}
        />
      )}

      {item.completions.length > 0 && (
        <SectionCard title="History">
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
                {c.details && (
                  <p className="mt-1">{describeDetails(c.details)}</p>
                )}
                {c.expiresOn && (
                  <p className="mt-1">Expires {formatDate(c.expiresOn)}</p>
                )}
                {c.note && <p className="mt-1 whitespace-pre-wrap">{c.note}</p>}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard title="Edit">
        <ItemForm
          key={item.updatedAt.getTime()}
          action={updateItem.bind(null, item.id)}
          logbookMeter={logbook?.label}
          item={item}
          cycles={cycles}
          submitLabel="Save item"
        />
        <DeleteItemForm action={deleteItem.bind(null, item.id)} />
      </SectionCard>
    </>
  );
}

// The oil the aircraft's last oil change used, whichever item logged it.
async function lastOilTypeOn(aircraftId: string) {
  const [last] = await db()
    .select({ details: maintenanceCompletion.details })
    .from(maintenanceCompletion)
    .innerJoin(
      maintenanceItem,
      eq(maintenanceItem.id, maintenanceCompletion.itemId),
    )
    .where(
      and(
        eq(maintenanceItem.aircraftId, aircraftId),
        sql`${maintenanceCompletion.details}->>'kind' = 'oil_change'`,
      ),
    )
    .orderBy(
      desc(maintenanceCompletion.completedOn),
      desc(maintenanceCompletion.createdAt),
    )
    .limit(1);
  return last?.details?.kind === "oil_change"
    ? last.details.oilType
    : undefined;
}

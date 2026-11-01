import { cn } from "cn";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LocalTime } from "@/components/local-time";
import { DetailSkeleton } from "@/components/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { squawk } from "@/db/schema";
import { STATUS_CLASSES } from "@/components/aircraft-status";
import { aircraftAlerts } from "@/lib/fleet";
import { hasRole } from "@/lib/access";
import { isUuid } from "@/lib/ids";
import { requireMember } from "@/lib/session";
import {
  allowedChanges,
  CATEGORY_LABELS,
  STATUS_LABELS,
} from "@/lib/squawk-rules";

import { changeSquawk } from "../actions";
import { OfficerControls } from "./officer-controls";

export const metadata: Metadata = { title: "Squawk · Flight Club" };

const CHANGE_CONFIRMATIONS: Record<string, string> = {
  resolve: "Squawk resolved.",
  defer: "Squawk deferred.",
  reopen: "Squawk reopened.",
};

export default function SquawkPage({
  params,
  searchParams,
}: PageProps<"/squawks/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <SquawkDetails params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function SquawkDetails({
  params,
  searchParams,
}: Pick<PageProps<"/squawks/[id]">, "params" | "searchParams">) {
  const member = await requireMember();
  const { id } = await params;
  const { reported, changed } = await searchParams;
  if (!isUuid(id)) notFound();

  const row = await db().query.squawk.findFirst({
    where: eq(squawk.id, id),
    with: {
      aircraft: { columns: { id: true, tailNumber: true } },
      reportedBy: { columns: { name: true } },
      resolvedBy: { columns: { name: true } },
      photos: {
        columns: { id: true },
        orderBy: (p, { asc }) => asc(p.createdAt),
      },
    },
  });
  if (!row) notFound();
  const { status } = (await aircraftAlerts([row.aircraft.id])).get(
    row.aircraft.id,
  )!;
  const { grounding } = row;
  const tail = row.aircraft.tailNumber;
  const changeConfirmation =
    typeof changed === "string" && CHANGE_CONFIRMATIONS[changed];

  return (
    <>
      {(reported || changeConfirmation) && (
        <div
          role="status"
          className={cn(
            "rounded-lg border p-4",
            {
              grounded: "border-destructive/50 bg-destructive/10",
              "vfr-only": "border-amber-600/40 bg-amber-500/10",
              airworthy: "border-green-600/40 bg-green-600/10",
            }[status],
          )}
        >
          <p className="font-semibold">
            {changeConfirmation || "Squawk reported."}
          </p>
          <p className={cn("text-lg", STATUS_CLASSES[status])}>
            {tail} is{" "}
            {status === "grounded"
              ? "grounded"
              : status === "vfr-only"
                ? "VFR only"
                : reported
                  ? "still airworthy"
                  : "airworthy"}
            .
          </p>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Squawk on {tail}
        </h1>
        <p className="text-muted-foreground">
          {row.reportedBy.name}, <LocalTime at={row.reportedAt} />
        </p>
      </div>

      <p className="whitespace-pre-wrap">{row.description}</p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border bg-card p-4 sm:p-5">
        <dt className="text-muted-foreground">Grounds the airplane</dt>
        <dd>
          {grounding === "all"
            ? "Yes"
            : grounding === "ifr"
              ? "IFR only (VFR allowed)"
              : "No"}
        </dd>
        <dt className="text-muted-foreground">Category</dt>
        <dd>{CATEGORY_LABELS[row.category]}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd>{STATUS_LABELS[row.status]}</dd>
      </dl>

      {row.status === "resolved" && (
        <div className="rounded-lg bg-muted p-4">
          <p className="text-sm text-muted-foreground">
            Resolved by {row.resolvedBy?.name},{" "}
            {row.resolvedAt && <LocalTime at={row.resolvedAt} />}
          </p>
          <p className="whitespace-pre-wrap">{row.resolutionNote}</p>
        </div>
      )}

      {hasRole(member, "officer") && (
        <OfficerControls
          action={changeSquawk.bind(null, row.id)}
          allowed={allowedChanges({
            status: row.status,
            grounds: grounding !== "none",
          })}
          grounds={grounding !== "none"}
        />
      )}

      {row.photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {row.photos.map((photo, i) => (
            <li key={photo.id}>
              <a href={`/squawks/photos/${photo.id}`}>
                {/* Served from a route that checks the session; there's no
                    public URL for next/image to optimize. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/squawks/photos/${photo.id}`}
                  alt={`Photo ${i + 1} of the squawk`}
                  className="aspect-square w-full rounded-lg object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/"
        className={cn(buttonVariants({ variant: "outline" }), "h-11 text-base")}
      >
        Done
      </Link>
    </>
  );
}

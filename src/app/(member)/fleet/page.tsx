import { cn } from "cn";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AircraftStatusLabel } from "@/components/aircraft-status";
import { fleetStatus, recentlyResolved } from "@/lib/fleet";
import { describeDue } from "@/lib/maintenance";
import { requireMember } from "@/lib/session";
import { STATUS_LABELS } from "@/lib/squawk-rules";

export const metadata: Metadata = { title: "Fleet · Flight Club" };

export default function FleetPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Fleet</h1>
      <Suspense fallback={<div className="h-96" />}>
        <Fleet />
      </Suspense>
    </>
  );
}

async function Fleet() {
  await requireMember();
  const [fleet, resolved] = await Promise.all([
    fleetStatus(),
    recentlyResolved(),
  ]);

  return (
    <>
      <ul className="flex flex-col gap-4">
        {fleet.map((plane) => (
          <li key={plane.id}>
            <section
              id={plane.tailNumber}
              aria-label={plane.tailNumber}
              className={cn(
                // Clear of the sticky header when linked to from home.
                "scroll-mt-20 rounded-lg border",
                plane.status === "grounded" && "border-destructive/50",
                plane.status === "vfr-only" && "border-amber-600/50",
              )}
            >
              <header className="flex items-baseline justify-between gap-2 px-4 py-3">
                <div>
                  <h2 className="text-lg font-semibold">{plane.tailNumber}</h2>
                  <p className="text-sm text-muted-foreground">
                    {plane.makeModel}
                    {plane.checkedOutTo && ` · out with ${plane.checkedOutTo}`}
                  </p>
                </div>
                <AircraftStatusLabel status={plane.status} />
              </header>
              {plane.maintenance.length > 0 && (
                <ul className="divide-y border-t">
                  {plane.maintenance.map((m) => (
                    <li
                      key={m.id}
                      className="flex min-h-12 items-center justify-between gap-3 px-4 py-2"
                    >
                      <span>
                        {m.name}{" "}
                        <span className="text-sm text-muted-foreground">
                          {describeDue(m, m.meterLabel)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-sm font-medium",
                          m.state === "overdue"
                            ? "text-destructive"
                            : "text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {m.state === "overdue" ? "Overdue" : "Due soon"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {plane.squawks.length > 0 && (
                <ul className="divide-y border-t">
                  {plane.squawks.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/squawks/${s.id}`}
                        className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 hover:bg-muted"
                      >
                        <span>{s.description}</span>
                        <span
                          className={cn(
                            "shrink-0 text-sm",
                            s.status === "open" && s.grounding !== "none"
                              ? s.grounding === "all"
                                ? "font-medium text-destructive"
                                : "font-medium text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {s.status === "open" && s.grounding !== "none"
                            ? s.grounding === "all"
                              ? "Grounding"
                              : "No IFR"
                            : STATUS_LABELS[s.status]}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </li>
        ))}
      </ul>

      {resolved.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Recently resolved</h2>
          <ul className="divide-y rounded-lg border">
            {resolved.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/squawks/${s.id}`}
                  className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 hover:bg-muted"
                >
                  <span>
                    <span className="font-medium">{s.aircraft.tailNumber}</span>{" "}
                    {s.description}
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {s.resolvedAt?.toISOString().slice(0, 10)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

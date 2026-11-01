import { cn } from "cn";

import type { AircraftAlerts } from "@/lib/fleet";
import { describeDue } from "@/lib/maintenance";
import type { PilotWarning } from "@/lib/qualifications";

// Shown when checking an aircraft out, before anything is entered
// (docs/spec.md, section 6): what grounds the aircraft or limits it to
// VFR, what's due, then anything about the pilot.  Only grounding stops
// the check-out; the rest is for the pilot to weigh.
export function PreflightWarnings({
  tailNumber,
  alerts,
  pilot,
}: {
  tailNumber: string;
  alerts: AircraftAlerts;
  pilot: PilotWarning[];
}) {
  const serious = pilot.some((w) => w.severity === "expired");
  // What restricts flying, by how much: overdue items at their level, and
  // the open squawks.
  const restricting = (level: "all" | "ifr") => [
    ...alerts.squawks
      .filter((s) => s.grounding === level)
      .map((s) => ({ key: s.description, text: s.description })),
    ...alerts.maintenance
      .filter((m) => m.state === "overdue" && m.grounding === level)
      .map((m) => ({
        key: m.id,
        text: `${m.name}: ${describeDue(m, m.meterLabel)}`,
      })),
  ];
  const grounding = restricting("all");
  const ifr = restricting("ifr");
  const other = alerts.maintenance.filter(
    (m) => m.state !== "overdue" || m.grounding === "none",
  );

  return (
    <>
      {grounding.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="font-semibold text-destructive">
            {tailNumber} is grounded
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {grounding.map((r) => (
              <li key={r.key}>{r.text}</li>
            ))}
          </ul>
        </div>
      )}
      {ifr.length > 0 && (
        <div className="rounded-lg border border-amber-600/40 bg-amber-500/10 p-4">
          <p className="font-semibold text-amber-800 dark:text-amber-300">
            {tailNumber} is VFR only
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {ifr.map((r) => (
              <li key={r.key}>{r.text}</li>
            ))}
          </ul>
        </div>
      )}
      {other.length > 0 && (
        <div className="rounded-lg border border-amber-600/40 bg-amber-500/10 p-4">
          <p className="font-semibold text-amber-800 dark:text-amber-300">
            Maintenance{" "}
            {other.some((m) => m.state === "overdue")
              ? "overdue or due soon"
              : "due soon"}
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {other.map((m) => (
              <li key={m.id}>
                {m.name}: {describeDue(m, m.meterLabel)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pilot.length > 0 && (
        <div
          className={cn(
            "rounded-lg border p-4",
            serious
              ? "border-destructive/50 bg-destructive/10"
              : "border-amber-600/40 bg-amber-500/10",
          )}
        >
          <p
            className={cn(
              "font-semibold",
              serious
                ? "text-destructive"
                : "text-amber-800 dark:text-amber-300",
            )}
          >
            Before you fly
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {pilot.map((w) => (
              <li key={w.message}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

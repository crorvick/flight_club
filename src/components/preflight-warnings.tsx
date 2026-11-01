import type { AircraftAlerts } from "@/lib/fleet";
import { describeDue } from "@/lib/maintenance";

// Shown on the flight log before the pilot enters anything (docs/spec.md,
// section 6): what grounds the aircraft, then what's due.  Warnings, not
// blocks; whether to fly is the pilot's call.
export function PreflightWarnings({
  tailNumber,
  alerts,
}: {
  tailNumber: string;
  alerts: AircraftAlerts;
}) {
  const grounding = alerts.maintenance.filter(
    (m) => m.state === "overdue" && m.groundsWhenOverdue,
  );
  const other = alerts.maintenance.filter((m) => !grounding.includes(m));

  return (
    <>
      {alerts.grounded && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="font-semibold text-destructive">
            {tailNumber} is grounded
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {alerts.groundingSquawks.map((description) => (
              <li key={description}>{description}</li>
            ))}
            {grounding.map((m) => (
              <li key={m.id}>
                {m.name}: {describeDue(m, m.meterLabel)}
              </li>
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
    </>
  );
}

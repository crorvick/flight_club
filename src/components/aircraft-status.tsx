import { cn } from "cn";

import { type AircraftStatus, STATUS_LABELS } from "@/lib/grounding";

export const STATUS_CLASSES: Record<AircraftStatus, string> = {
  grounded: "font-medium text-destructive",
  "vfr-only": "font-medium text-amber-700 dark:text-amber-400",
  airworthy: "text-green-700 dark:text-green-400",
};

// "Grounded", "VFR only" or "Airworthy", coloured to match.
export function AircraftStatusLabel({
  status,
  className,
}: {
  status: AircraftStatus;
  className?: string;
}) {
  return (
    <span className={cn(STATUS_CLASSES[status], className)}>
      {STATUS_LABELS[status]}
    </span>
  );
}

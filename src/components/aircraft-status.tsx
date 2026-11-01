import { cn } from "cn";
import { CircleCheck, OctagonX, TriangleAlert } from "lucide-react";

import { type AircraftStatus, STATUS_LABELS } from "@/lib/grounding";

// Text colour alone, for a sentence that states the status.
export const STATUS_CLASSES: Record<AircraftStatus, string> = {
  grounded: "font-medium text-destructive",
  "vfr-only": "font-medium text-amber-700 dark:text-amber-400",
  airworthy: "text-green-700 dark:text-green-400",
};

export const STATUS_CHIP_CLASSES: Record<AircraftStatus, string> = {
  grounded: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  "vfr-only":
    "bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  airworthy:
    "bg-green-600/10 text-green-800 dark:bg-green-400/15 dark:text-green-300",
};

export const STATUS_ICONS = {
  grounded: OctagonX,
  "vfr-only": TriangleAlert,
  airworthy: CircleCheck,
} satisfies Record<AircraftStatus, unknown>;

// "Grounded", "VFR only" or "Airworthy" as a chip: the colour and the
// icon both carry it, so it reads at a glance in bright sunlight and
// without relying on colour alone.
export function AircraftStatusLabel({
  status,
  className,
}: {
  status: AircraftStatus;
  className?: string;
}) {
  const Icon = STATUS_ICONS[status];
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_CHIP_CLASSES[status],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {STATUS_LABELS[status]}
    </span>
  );
}

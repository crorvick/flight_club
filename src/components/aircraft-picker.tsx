import { cn } from "cn";
import Link from "next/link";

import type { AircraftCard } from "@/lib/fleet";

// Big cards rather than a dropdown: one tap, and the status is visible
// before choosing.  Each is a link, so the choice lives in the URL and the
// page renders that aircraft's meters on the server.
export function AircraftPicker({
  fleet,
  selectedId,
  path,
}: {
  fleet: AircraftCard[];
  selectedId: string;
  // The page the cards link back to, with ?aircraft= appended.
  path: "/flights/new" | "/squawks/new";
}) {
  return (
    <nav aria-label="Aircraft">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fleet.map((plane) => {
          const selected = plane.id === selectedId;
          return (
            <li key={plane.id}>
              <Link
                href={`${path}?aircraft=${plane.id}`}
                replace
                scroll={false}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col justify-center rounded-lg border px-3 py-2",
                  selected
                    ? "border-primary bg-primary/5 ring-2 ring-primary"
                    : "border-border hover:bg-muted",
                )}
              >
                <span className="text-lg font-semibold">
                  {plane.tailNumber}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    plane.grounded
                      ? "font-medium text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {plane.grounded ? "Grounded" : "Airworthy"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

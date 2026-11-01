import { BookOpen, ChevronRight, Droplet, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/page-skeleton";
import { requireReporter } from "@/lib/reports";

export const metadata: Metadata = { title: "Reports · Flight Club" };

const REPORTS = [
  {
    href: "/reports/mechanic",
    icon: Wrench,
    title: "Mechanic's report",
    description:
      "Squawks since the last annual and where they stand, maintenance done since, and when every item is next due.",
  },
  {
    href: "/reports/oil",
    icon: Droplet,
    title: "Oil",
    description:
      "Each oil change: the oil it ran, hours on it, quarts added before the next change, and hours per quart.",
  },
  {
    href: "/reports/flights",
    icon: BookOpen,
    title: "Flights",
    description:
      "Hours flown by aircraft and by pilot over a period, and every flight: who flew what, when.",
  },
];

export default function ReportsPage() {
  return (
    <div className="wide flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Each opens as a page you can save as a PDF.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton rows={3} tall />}>
        <ReportList />
      </Suspense>
    </div>
  );
}

async function ReportList() {
  await requireReporter();
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {REPORTS.map(({ href, icon: Icon, title, description }) => (
        <li key={href}>
          <Link
            href={href}
            className="flex h-full flex-col gap-2 rounded-xl border bg-card p-5 hover:bg-muted"
          >
            <span className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon aria-hidden className="size-5" />
              </span>
              <ChevronRight
                aria-hidden
                className="size-4 text-muted-foreground"
              />
            </span>
            <span className="font-semibold">{title}</span>
            <span className="text-sm text-muted-foreground">{description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

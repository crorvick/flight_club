import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/page-skeleton";
import {
  EmptyNote,
  ReportHeader,
  ReportSection,
  ReportTable,
} from "@/components/report";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { today } from "@/lib/fleet";
import { formatAmount } from "@/lib/fluids";
import { formatHours, parseHours } from "@/lib/hours";
import { flightReport, requireReporter } from "@/lib/reports";

export const metadata: Metadata = { title: "Flight report · Flight Club" };

export default function FlightReportPage({
  searchParams,
}: PageProps<"/reports/flights">) {
  return (
    <div className="wide flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton title rows={6} />}>
        <FlightReport searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const isDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const hours = (hundredths: number) => formatHours(hundredths);

type Total = { flights: number; hours: number };
function add(totals: Map<string, Total>, key: string, hundredths: number) {
  const total = totals.get(key) ?? { flights: 0, hours: 0 };
  total.flights += 1;
  total.hours += hundredths;
  totals.set(key, total);
}

async function FlightReport({
  searchParams,
}: Pick<PageProps<"/reports/flights">, "searchParams">) {
  const { planes } = await requireReporter();
  const params = await searchParams;
  // This month so far, unless asked for another period.
  const to = isDate(params.to) ? params.to : today();
  const from = isDate(params.from) ? params.from : `${to.slice(0, 8)}01`;
  const only = planes.find((p) => p.id === params.aircraft);
  const flights = await flightReport(
    only ? [only.id] : planes.map((p) => p.id),
    from,
    to,
  );

  const byAircraft = new Map<string, Total>();
  const byPilot = new Map<string, Total>();
  // Hours each pilot flew in each aircraft, for "who flies what".
  const pilotAircraft = new Map<string, Map<string, number>>();
  const pilotNames = new Map<string, string>();
  let totalHours = 0;
  for (const f of flights) {
    const billed = parseHours(f.billedHours)!;
    totalHours += billed;
    add(byAircraft, f.tailNumber, billed);
    add(byPilot, f.pilotId, billed);
    pilotNames.set(f.pilotId, f.pilot);
    const flown = pilotAircraft.get(f.pilotId) ?? new Map<string, number>();
    flown.set(f.tailNumber, (flown.get(f.tailNumber) ?? 0) + billed);
    pilotAircraft.set(f.pilotId, flown);
  }
  const pilots = [...byPilot.entries()].sort((a, b) => b[1].hours - a[1].hours);

  return (
    <>
      <ReportHeader
        title="Flight report"
        subtitle={`${formatDate(from)} to ${formatDate(to)} · ${only ? only.tailNumber : "all aircraft"} · billed hours`}
      >
        <Form
          action="/reports/flights"
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            From
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="h-10 rounded-lg border border-input bg-transparent px-2 text-base font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            To
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="h-10 rounded-lg border border-input bg-transparent px-2 text-base font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Aircraft
            <select
              name="aircraft"
              defaultValue={only?.id ?? ""}
              className="h-10 min-w-40 rounded-lg border border-input bg-transparent px-2 text-base font-normal"
            >
              <option value="">All aircraft</option>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.tailNumber}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline" className="h-10 px-4">
            Show
          </Button>
        </Form>
      </ReportHeader>

      {flights.length === 0 ? (
        <EmptyNote>No flights in this period.</EmptyNote>
      ) : (
        <>
          <div className="grid items-start gap-6 lg:grid-cols-2 print:grid-cols-2">
            <ReportSection title="By aircraft">
              <ReportTable head={["Aircraft", "Flights", "Hours"]}>
                {[...byAircraft.entries()].map(([tail, total]) => (
                  <tr key={tail}>
                    <td className="font-medium">{tail}</td>
                    <td>{total.flights}</td>
                    <td>{hours(total.hours)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td>Total</td>
                  <td>{flights.length}</td>
                  <td>{hours(totalHours)}</td>
                </tr>
              </ReportTable>
            </ReportSection>

            <ReportSection title="By pilot">
              <ReportTable head={["Pilot", "Flights", "Hours", "Flew"]}>
                {pilots.map(([pilotId, total]) => (
                  <tr key={pilotId}>
                    <td className="font-medium">{pilotNames.get(pilotId)}</td>
                    <td>{total.flights}</td>
                    <td>{hours(total.hours)}</td>
                    <td className="text-muted-foreground">
                      {[...pilotAircraft.get(pilotId)!.entries()]
                        .map(([tail, h]) => `${tail} ${hours(h)}`)
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </ReportTable>
            </ReportSection>
          </div>

          <ReportSection title="Flights">
            <ReportTable
              head={["Date", "Aircraft", "Pilot", "Hours", "Fuel", "Oil"]}
            >
              {flights.map((f) => (
                <tr key={f.id}>
                  <td className="whitespace-nowrap">
                    <Link
                      href={`/flights/${f.id}`}
                      className="hover:underline print:no-underline"
                    >
                      {formatDate(f.date, { weekday: true })}
                    </Link>
                  </td>
                  <td>{f.tailNumber}</td>
                  <td>{f.pilot}</td>
                  <td>{hours(parseHours(f.billedHours)!)}</td>
                  <td>
                    {f.fuelAdded === null
                      ? "—"
                      : formatAmount(f.fuelAdded, "gal")}
                  </td>
                  <td>
                    {f.oilAdded === null
                      ? "—"
                      : [f.oilAdded, f.oilAdded2]
                          .filter((q) => q !== null)
                          .map((q) => formatAmount(q!, "qt"))
                          .join(" / ")}
                  </td>
                </tr>
              ))}
            </ReportTable>
          </ReportSection>
        </>
      )}
    </>
  );
}

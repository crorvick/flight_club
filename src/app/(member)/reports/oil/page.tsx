import type { Metadata } from "next";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/page-skeleton";
import {
  AircraftChooser,
  EmptyNote,
  ReportHeader,
  ReportSection,
  ReportTable,
} from "@/components/report";
import { formatDate } from "@/lib/dates";
import { engineLabels } from "@/lib/engines";
import { formatHours } from "@/lib/hours";
import { hoursPerQuart, type OilPeriod } from "@/lib/oil-report";
import { oilReport, pickAircraft, requireReporter } from "@/lib/reports";

export const metadata: Metadata = { title: "Oil report · Flight Club" };

export default function OilReportPage({
  searchParams,
}: PageProps<"/reports/oil">) {
  return (
    <div className="wide flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton title rows={4} />}>
        <OilReport searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const quarts = (tenths: number) => `${(tenths / 10).toFixed(1)} qt`;
const hours = (hundredths: number) => `${formatHours(hundredths)} h`;

async function OilReport({
  searchParams,
}: Pick<PageProps<"/reports/oil">, "searchParams">) {
  const { planes } = await requireReporter();
  const plane = pickAircraft(planes, (await searchParams).aircraft);
  const report = await oilReport(plane.id);
  const labels = engineLabels(report.engines);
  const perEngine = (values: string[]) =>
    values.map((v, i) => (labels[i] ? `${labels[i]} ${v}` : v)).join(", ");
  const current = report.periods.at(-1);

  return (
    <>
      <ReportHeader
        title="Oil report"
        subtitle={`${plane.tailNumber} · ${plane.makeModel}${report.logbook ? ` · hours on the ${report.logbook.label.toLowerCase()}` : ""}`}
      >
        <AircraftChooser
          action="/reports/oil"
          planes={planes}
          selected={plane.id}
        />
      </ReportHeader>

      {!current ? (
        <EmptyNote>
          No oil changes logged for {plane.tailNumber} yet. Log them on an item
          of the Oil change kind.
        </EmptyNote>
      ) : (
        <>
          <ReportSection title="Current oil">
            <dl className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-4">
              <Fact label="Oil">{current.change.details.oilType}</Fact>
              <Fact label="Changed">
                {formatDate(current.change.completedOn)}
                {current.change.reading !== null &&
                  ` at ${formatHours(current.change.reading)}`}
              </Fact>
              <Fact label="Hours since">{hours(current.hours)}</Fact>
              <Fact label="Added since">
                {perEngine(current.added.map(quarts))}
              </Fact>
            </dl>
          </ReportSection>

          <ReportSection title="History">
            <ReportTable
              head={[
                "Changed",
                "At",
                "Oil",
                "Put in",
                "Filter",
                "Hours run",
                "Added",
                "Hours per qt",
                "Flights",
              ]}
            >
              {[...report.periods].reverse().map((period) => (
                <PeriodRow
                  key={`${period.change.completedOn}-${period.change.reading}`}
                  period={period}
                  perEngine={perEngine}
                />
              ))}
            </ReportTable>
            {report.periods.some((p) => p.unrecorded > 0) && (
              <p className="text-sm text-muted-foreground">
                * Includes flights from before oil added was recorded, so the
                amount added may be low.
              </p>
            )}
          </ReportSection>
        </>
      )}
    </>
  );
}

function PeriodRow({
  period,
  perEngine,
}: {
  period: OilPeriod;
  perEngine: (values: string[]) => string;
}) {
  const { change } = period;
  return (
    <tr>
      <td className="whitespace-nowrap">{formatDate(change.completedOn)}</td>
      <td>{change.reading === null ? "—" : formatHours(change.reading)}</td>
      <td>{change.details.oilType}</td>
      <td className="whitespace-nowrap">
        {perEngine(change.details.quarts.map((q) => `${q} qt`))}
      </td>
      <td>{change.details.filterReplaced ? "Replaced" : "—"}</td>
      <td className="whitespace-nowrap">
        {hours(period.hours)}
        {period.next === null && " so far"}
      </td>
      <td className="whitespace-nowrap">
        {perEngine(period.added.map(quarts))}
        {period.unrecorded > 0 && " *"}
      </td>
      <td className="whitespace-nowrap">
        {perEngine(
          period.added.map((added) => {
            const rate = hoursPerQuart(period.hours, added);
            return rate === null ? "—" : String(rate);
          }),
        )}
      </td>
      <td>{period.flights}</td>
    </tr>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

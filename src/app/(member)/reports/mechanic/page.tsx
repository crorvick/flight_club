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
import { today } from "@/lib/fleet";
import { formatHours, parseHours } from "@/lib/hours";
import { describeDue, maintenanceStatus } from "@/lib/maintenance";
import {
  defaultName,
  describeDetails,
  SCOPE_LABELS,
} from "@/lib/maintenance-kinds";
import { mechanicReport, pickAircraft, requireReporter } from "@/lib/reports";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/squawk-rules";

export const metadata: Metadata = {
  title: "Mechanic's report · Flight Club",
};

export default function MechanicReportPage({
  searchParams,
}: PageProps<"/reports/mechanic">) {
  return (
    <div className="wide flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton title rows={6} />}>
        <MechanicReport searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const GROUNDING = { all: "Grounds", ifr: "No IFR", none: "—" } as const;
const STATE = {
  ok: "OK",
  "due-soon": "Due soon",
  overdue: "Overdue",
  closed: "Done",
};
const reading = (hours: string | null) =>
  hours === null ? "—" : formatHours(parseHours(hours)!);

async function MechanicReport({
  searchParams,
}: Pick<PageProps<"/reports/mechanic">, "searchParams">) {
  const { planes } = await requireReporter();
  const plane = pickAircraft(planes, (await searchParams).aircraft);
  const report = await mechanicReport(plane.id);
  const { lastAnnual, logbook } = report;
  const sinceAnnual =
    lastAnnual?.reading && logbook
      ? parseHours(logbook.currentReading)! - parseHours(lastAnnual.reading)!
      : null;
  const date = today();

  return (
    <>
      <ReportHeader
        title="Mechanic's report"
        subtitle={`${plane.tailNumber} · ${plane.makeModel}`}
      >
        <AircraftChooser
          action="/reports/mechanic"
          planes={planes}
          selected={plane.id}
        />
      </ReportHeader>

      <ReportSection title="Aircraft">
        <dl className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-muted-foreground">Last annual</dt>
            <dd className="font-medium">
              {lastAnnual
                ? `${formatDate(lastAnnual.completedOn)}${lastAnnual.reading ? ` at ${reading(lastAnnual.reading)}` : ""}`
                : "None logged"}
            </dd>
          </div>
          {sinceAnnual !== null && (
            <div>
              <dt className="text-sm text-muted-foreground">
                Since the annual
              </dt>
              <dd className="font-medium">
                {formatHours(sinceAnnual)} h ({logbook!.label.toLowerCase()})
              </dd>
            </div>
          )}
          {report.meters.map((m) => (
            <div key={m.id}>
              <dt className="text-sm text-muted-foreground">{m.label} now</dt>
              <dd className="font-medium tabular-nums">
                {reading(m.currentReading)}
              </dd>
            </div>
          ))}
        </dl>
      </ReportSection>

      <ReportSection
        title={
          lastAnnual
            ? `Squawks since ${formatDate(lastAnnual.completedOn)}, and any older still open`
            : "Squawks"
        }
      >
        {report.squawks.length === 0 ? (
          <EmptyNote>None.</EmptyNote>
        ) : (
          <ReportTable
            head={["Reported", "Squawk", "Category", "Grounding", "Status"]}
          >
            {report.squawks.map((s) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap">
                  {formatDate(s.reportedAt.toISOString().slice(0, 10))}
                  <span className="block text-muted-foreground">
                    {s.reportedBy.name}
                  </span>
                </td>
                <td className="min-w-48 whitespace-pre-wrap">
                  {s.description}
                </td>
                <td>{CATEGORY_LABELS[s.category]}</td>
                <td>{GROUNDING[s.grounding]}</td>
                <td className="min-w-40">
                  <span className="font-medium">{STATUS_LABELS[s.status]}</span>
                  {s.status === "resolved" && s.resolvedAt && (
                    <span className="block text-muted-foreground">
                      {formatDate(s.resolvedAt.toISOString().slice(0, 10))},{" "}
                      {s.resolvedBy?.name}: {s.resolutionNote}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </ReportTable>
        )}
      </ReportSection>

      <ReportSection
        title={
          lastAnnual
            ? `Maintenance logged since ${formatDate(lastAnnual.completedOn)}`
            : "Maintenance logged"
        }
      >
        {report.completions.length === 0 ? (
          <EmptyNote>None.</EmptyNote>
        ) : (
          <ReportTable head={["Done", "Item", "At", "Details", "Logged by"]}>
            {report.completions.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap">
                  {formatDate(c.completedOn)}
                </td>
                <td>{c.item}</td>
                <td>{reading(c.reading)}</td>
                <td className="min-w-48">
                  {[c.details && describeDetails(c.details), c.note]
                    .filter(Boolean)
                    .join(". ") || "—"}
                </td>
                <td>{c.by ?? "—"}</td>
              </tr>
            ))}
          </ReportTable>
        )}
      </ReportSection>

      <ReportSection title="Maintenance items">
        {report.items.length === 0 ? (
          <EmptyNote>No maintenance items set up.</EmptyNote>
        ) : (
          <ReportTable head={["Item", "Last done", "Next due", "Status"]}>
            {report.items.map((item) => {
              const status = maintenanceStatus(
                {
                  ...item,
                  currentReading: logbook?.currentReading ?? null,
                },
                date,
              );
              return (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className="whitespace-nowrap">
                    {item.lastCompletedOn
                      ? formatDate(item.lastCompletedOn)
                      : "—"}
                    {item.lastCompletedReading &&
                      ` at ${reading(item.lastCompletedReading)}`}
                  </td>
                  <td>{describeDue(status, logbook?.label)}</td>
                  <td className="font-medium">{STATE[status.state]}</td>
                </tr>
              );
            })}
          </ReportTable>
        )}
      </ReportSection>

      <ReportSection title="Airworthiness directives and service bulletins">
        {report.directives.length === 0 ? (
          <EmptyNote>None recorded.</EmptyNote>
        ) : (
          <ReportTable
            head={[
              "AD / SB",
              "Subject",
              "Applies to",
              "Status",
              "Method of compliance",
            ]}
          >
            {report.directives.map((item) => {
              const fallback = defaultName(item.kind, item.reference);
              const status = maintenanceStatus(
                {
                  ...item,
                  currentReading: logbook?.currentReading ?? null,
                },
                date,
              );
              const last = item.completions[0];
              const method =
                last?.details && "terminating" in last.details
                  ? last.details.method
                  : last?.note;
              return (
                <tr key={item.id}>
                  <td className="font-medium whitespace-nowrap">{fallback}</td>
                  <td>{item.name === fallback ? "—" : item.name}</td>
                  <td>{item.appliesTo ? SCOPE_LABELS[item.appliesTo] : "—"}</td>
                  <td className="min-w-40">
                    {status.notApplicable
                      ? "Not applicable"
                      : status.closedOn
                        ? `Complied with ${formatDate(status.closedOn)}`
                        : `${item.schedule === "recurring" ? "Recurring" : STATE[status.state]}: ${describeDue(status, logbook?.label)}`}
                  </td>
                  <td className="min-w-48">
                    {status.notApplicable ??
                      (last
                        ? `${method ?? "—"} (${formatDate(last.completedOn)}${last.reading ? ` at ${reading(last.reading)}` : ""})`
                        : "—")}
                  </td>
                </tr>
              );
            })}
          </ReportTable>
        )}
      </ReportSection>
    </>
  );
}

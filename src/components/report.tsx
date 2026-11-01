import { cn } from "cn";
import Form from "next/form";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { today } from "@/lib/fleet";
import type { ReportAircraft } from "@/lib/reports";

import { PrintButton } from "./print-button";

// A report's title block: what it is, for what, and when it was made,
// which prints at the top of the PDF.  The controls don't print.
export function ReportHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
          <p className="hidden text-sm text-muted-foreground print:block">
            Flight Club · printed {formatDate(today())}
          </p>
        </div>
        <div className="print:hidden">
          <PrintButton />
        </div>
      </div>
      {children && <div className="print:hidden">{children}</div>}
    </div>
  );
}

export function ReportSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn("flex break-inside-avoid-page flex-col gap-2", className)}
    >
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

// A table on a card, scrolling sideways on a narrow screen rather than
// squeezing; rows don't split across printed pages.
export function ReportTable({
  head,
  children,
}: {
  head: React.ReactNode[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card print:overflow-visible print:rounded-none print:border-0">
      <table className="w-full text-left text-sm tabular-nums [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:px-3 [&_th]:py-2 [&_tr]:break-inside-avoid">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y border-t">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

// Choose the aircraft; a plain GET form, so the choice is in the URL and
// the report can be bookmarked or shared.
export function AircraftChooser({
  action,
  planes,
  selected,
}: {
  action: string;
  planes: ReportAircraft[];
  selected: string;
}) {
  return (
    <Form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Aircraft
        <select
          name="aircraft"
          defaultValue={selected}
          className="h-10 min-w-48 rounded-lg border border-input bg-transparent px-2 text-base font-normal"
        >
          {planes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.tailNumber} · {p.makeModel}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline" className="h-10 px-4">
        Show
      </Button>
    </Form>
  );
}

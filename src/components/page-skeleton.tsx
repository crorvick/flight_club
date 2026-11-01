import { cn } from "cn";

import { Skeleton } from "@/components/ui/skeleton";

// Placeholders shaped like the page that's loading, so a slow connection
// shows the page taking shape rather than a blank screen.

function Loading({
  wide = false,
  children,
}: {
  // Spans the layout's full width, like the page it stands in for.
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div aria-busy className={cn("flex flex-col gap-6", wide && "wide")}>
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

function Title() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

function Rows({ count, height }: { count: number; height: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={`${height} w-full rounded-xl`} />
      ))}
    </div>
  );
}

function Fields({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

// A list of rows or cards, as on the fleet and officer list pages.
export function ListSkeleton({
  title = false,
  rows = 4,
  tall = false,
}: {
  title?: boolean;
  rows?: number;
  tall?: boolean;
}) {
  return (
    <Loading>
      {title && <Title />}
      <Rows count={rows} height={tall ? "h-28" : "h-14"} />
    </Loading>
  );
}

// A form, optionally under a title.
export function FormSkeleton({
  title = false,
  fields = 4,
}: {
  title?: boolean;
  fields?: number;
}) {
  return (
    <Loading>
      {title && <Title />}
      <Fields count={fields} />
    </Loading>
  );
}

// A record: a title, a block of facts, then more below.
export function DetailSkeleton() {
  return (
    <Loading>
      <Title />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Rows count={3} height="h-10" />
    </Loading>
  );
}

// The aircraft cards to pick from, then the form for the one picked.
export function PickerSkeleton() {
  return (
    <Loading>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Fields count={3} />
    </Loading>
  );
}

export function DashboardSkeleton() {
  return (
    <Loading wide>
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    </Loading>
  );
}

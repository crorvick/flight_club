import { cn } from "cn";
import { and, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import {
  ChevronRight,
  CircleCheck,
  Clock,
  Gauge,
  Megaphone,
  Plane,
  TriangleAlert,
  UserPlus,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AircraftStatusLabel } from "@/components/aircraft-status";
import { BrandMark } from "@/components/brand-mark";
import { LocalTime } from "@/components/local-time";
import { DashboardSkeleton } from "@/components/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import {
  aircraft,
  dispatch,
  dispatchMeterReading,
  member as memberTable,
} from "@/db/schema";
import { hasRole } from "@/lib/access";
import { formatDate } from "@/lib/dates";
import { fleetStatus, today } from "@/lib/fleet";
import { canEditFlight } from "@/lib/flight-rules";
import { formatHours, parseHours } from "@/lib/hours";
import { describeDue } from "@/lib/maintenance";
import { isPending } from "@/lib/member-rules";
import { getQualifications } from "@/lib/pilots";
import { pilotWarnings } from "@/lib/qualifications";
import { getCurrentMember, type Member } from "@/lib/session";

import { recentFlights } from "./flights/data";

type Fleet = Awaited<ReturnType<typeof fleetStatus>>;

export default function Home() {
  return (
    // Reads the session, so it streams in after the static shell.
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const member = await getCurrentMember();
  if (!member) return <Welcome />;
  if (!member.active) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <h1 className="text-xl font-semibold tracking-tight">
          {isPending(member) ? "Almost there" : "Account deactivated"}
        </h1>
        <p role="status" className="text-muted-foreground">
          {isPending(member) ? (
            <>
              Thanks, {member.name}. Your account is waiting for an officer to
              approve it.
            </>
          ) : (
            <>
              Your account has been deactivated. If that&apos;s a mistake, ask
              an officer.
            </>
          )}
        </p>
      </section>
    );
  }

  const pilot = hasRole(member, "pilot");
  const officer = hasRole(member, "officer");
  const fleet = await fleetStatus();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome, {member.name.split(/\s+/)[0]}
      </h1>
      {pilot && <FlyCard member={member} />}
      {pilot && <Reminders member={member} />}
      {officer && <NeedsAttention fleet={fleet} />}
      <FleetGlance fleet={fleet} />
      {pilot && <RecentFlights member={member} />}
    </>
  );
}

function Welcome() {
  return (
    <section className="flex flex-col items-start gap-4 py-6">
      <BrandMark className="size-14" />
      <h1 className="text-3xl font-semibold tracking-tight">Flight Club</h1>
      <p className="text-lg text-muted-foreground">
        Check aircraft out and in, log flights, report squawks and keep the
        fleet airworthy.
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        {/* Links styled as buttons: they navigate, so they stay links for
            screen readers. */}
        <Link
          href="/sign-in"
          className={cn(buttonVariants(), "h-11 px-5 text-base")}
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-11 px-5 text-base",
          )}
        >
          Create account
        </Link>
      </div>
    </section>
  );
}

function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {children}
      </h2>
      {action}
    </div>
  );
}

// Check in the aircraft the pilot has out, or check one out: whichever
// comes next.
async function FlyCard({ member }: { member: Member }) {
  const [out] = await db()
    .select({
      id: dispatch.id,
      tailNumber: aircraft.tailNumber,
      makeModel: aircraft.makeModel,
      checkedOutAt: dispatch.checkedOutAt,
      vfrOnly: dispatch.vfrOnly,
    })
    .from(dispatch)
    .innerJoin(aircraft, eq(aircraft.id, dispatch.aircraftId))
    .where(and(eq(dispatch.pilotId, member.id), eq(dispatch.status, "out")));
  const squawkLink = (
    <Link
      href="/squawks/new"
      className={cn(
        buttonVariants({ variant: "outline" }),
        "h-12 gap-2 text-base",
      )}
    >
      <Megaphone aria-hidden />
      Report a squawk
    </Link>
  );
  return (
    <section
      aria-label="Fly"
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-5",
        out ? "border-primary/40 bg-primary/5" : "bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Plane aria-hidden className="size-5" />
        </span>
        {out ? (
          <div>
            <p className="text-lg font-semibold">You have {out.tailNumber}</p>
            <p className="text-sm text-muted-foreground">
              {out.makeModel} · checked out <LocalTime at={out.checkedOutAt} />
              {out.vfrOnly && " · VFR only"}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-lg font-semibold">Ready to fly?</p>
            <p className="text-sm text-muted-foreground">
              Check an aircraft out to confirm its meters and squawks before you
              go.
            </p>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {out ? (
          <Link
            href={`/dispatches/${out.id}`}
            className={cn(buttonVariants(), "h-12 text-base")}
          >
            Check in {out.tailNumber}
          </Link>
        ) : (
          <Link
            href="/check-out"
            className={cn(buttonVariants(), "h-12 text-base")}
          >
            Check out an aircraft
          </Link>
        )}
        {squawkLink}
      </div>
    </section>
  );
}

// Medical and flight review coming due, or missing.
async function Reminders({ member }: { member: Member }) {
  const q = await getQualifications(member.id);
  const warnings = pilotWarnings(
    {
      medicalExpiresOn: q.medicalExpiresOn,
      flightReviewOn: q.flightReviewOn,
      checkedOut: true,
    },
    today(),
  );
  if (warnings.length === 0) return null;
  const expired = warnings.some((w) => w.severity === "expired");
  return (
    <section
      aria-label="Reminders"
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        expired
          ? "border-destructive/40 bg-destructive/5"
          : "border-amber-600/40 bg-amber-500/10",
      )}
    >
      <TriangleAlert
        aria-hidden
        className={cn(
          "mt-0.5 size-5 shrink-0",
          expired ? "text-destructive" : "text-amber-700 dark:text-amber-400",
        )}
      />
      <div className="flex flex-1 flex-col gap-1 text-sm">
        {warnings.map((w) => (
          <p key={w.message}>{w.message}</p>
        ))}
        <Link href="/qualifications" className="font-medium underline">
          Update your qualifications
        </Link>
      </div>
    </section>
  );
}

function AttentionRow({
  href,
  icon: Icon,
  tone,
  title,
  detail,
}: {
  href: string;
  icon: typeof Clock;
  tone: "danger" | "warning" | "info";
  title: string;
  detail?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-muted"
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            tone === "danger" && "bg-destructive/10 text-destructive",
            tone === "warning" &&
              "bg-amber-500/15 text-amber-700 dark:text-amber-400",
            tone === "info" && "bg-primary/10 text-primary",
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          {detail && (
            <span className="block text-sm text-muted-foreground">
              {detail}
            </span>
          )}
        </span>
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
      </Link>
    </li>
  );
}

// Everything waiting on an officer, in one list: new members, meters that
// read more than was logged, open squawks and maintenance coming due.
async function NeedsAttention({ fleet }: { fleet: Fleet }) {
  const [[{ pending }], gaps] = await Promise.all([
    // Same test as isPending, as a query: inactive and never given a role.
    db()
      .select({ pending: count() })
      .from(memberTable)
      .where(
        and(
          eq(memberTable.active, false),
          sql`cardinality(${memberTable.roles}) = 0`,
        ),
      ),
    unreviewedGaps(),
  ]);
  const squawks = fleet.flatMap((plane) =>
    plane.squawks
      .filter((s) => s.status === "open")
      .map((s) => ({ ...s, tailNumber: plane.tailNumber })),
  );
  const maintenance = fleet.flatMap((plane) =>
    plane.maintenance.map((m) => ({ ...m, tailNumber: plane.tailNumber })),
  );
  const empty =
    pending === 0 &&
    gaps.length === 0 &&
    squawks.length === 0 &&
    maintenance.length === 0;

  return (
    <section aria-label="Needs attention" className="flex flex-col gap-2">
      <SectionHeading>Needs attention</SectionHeading>
      {empty ? (
        <p className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <CircleCheck aria-hidden className="size-4 text-green-600" />
          Nothing needs an officer right now.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {pending > 0 && (
            <AttentionRow
              href="/members"
              icon={UserPlus}
              tone="info"
              title={`${pending} ${pending === 1 ? "member" : "members"} waiting for approval`}
            />
          )}
          {gaps.map((g) => (
            <AttentionRow
              key={g.id}
              href={`/dispatches/${g.id}`}
              icon={Gauge}
              tone="warning"
              title={`Unlogged time on ${g.tailNumber}`}
              detail={
                <>
                  Found by {g.pilot}, <LocalTime at={g.at} format="date" />
                </>
              }
            />
          ))}
          {squawks.map((s) => (
            <AttentionRow
              key={s.id}
              href={`/squawks/${s.id}`}
              icon={Megaphone}
              tone={
                s.grounding === "all"
                  ? "danger"
                  : s.grounding === "ifr"
                    ? "warning"
                    : "info"
              }
              title={`${s.tailNumber}: ${s.description}`}
              detail={
                s.grounding === "all"
                  ? "Open squawk, grounds the aircraft"
                  : s.grounding === "ifr"
                    ? "Open squawk, no IFR"
                    : "Open squawk"
              }
            />
          ))}
          {maintenance.map((m) => (
            <AttentionRow
              key={m.id}
              href={`/maintenance/${m.id}`}
              icon={Wrench}
              tone={m.state === "overdue" ? "danger" : "warning"}
              title={`${m.tailNumber}: ${m.name}`}
              detail={describeDue(m, m.meterLabel)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// Dispatches whose meters read more than the app expected, not yet
// accounted for by an officer.
async function unreviewedGaps() {
  return db()
    .selectDistinct({
      id: dispatch.id,
      tailNumber: aircraft.tailNumber,
      pilot: memberTable.name,
      at: dispatch.checkedOutAt,
    })
    .from(dispatch)
    .innerJoin(
      dispatchMeterReading,
      eq(dispatchMeterReading.dispatchId, dispatch.id),
    )
    .innerJoin(aircraft, eq(aircraft.id, dispatch.aircraftId))
    .innerJoin(memberTable, eq(memberTable.id, dispatch.pilotId))
    .where(
      and(
        isNull(dispatch.gapReviewedAt),
        ne(dispatchMeterReading.out, dispatchMeterReading.expected),
      ),
    )
    .orderBy(desc(dispatch.checkedOutAt));
}

function FleetGlance({ fleet }: { fleet: Fleet }) {
  if (fleet.length === 0) return null;
  return (
    <section aria-label="Fleet" className="flex flex-col gap-2">
      <SectionHeading
        action={
          <Link
            href="/fleet"
            className="text-sm font-medium text-primary hover:underline"
          >
            Squawks and maintenance
          </Link>
        }
      >
        Fleet
      </SectionHeading>
      <ul className="grid gap-2 sm:grid-cols-2">
        {fleet.map((plane) => (
          <li key={plane.id}>
            <Link
              href={`/fleet#${plane.tailNumber}`}
              className="flex h-full flex-col gap-1 rounded-xl border bg-card px-4 py-3 hover:bg-muted"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-lg font-semibold">
                  {plane.tailNumber}
                </span>
                <AircraftStatusLabel status={plane.status} />
              </span>
              <span className="text-sm text-muted-foreground">
                {plane.makeModel}
                {plane.checkedOutTo && ` · out with ${plane.checkedOutTo}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function RecentFlights({ member }: { member: Member }) {
  const flights = await recentFlights(member.id);
  if (flights.length === 0) return null;
  return (
    <section aria-label="Your recent flights" className="flex flex-col gap-2">
      <SectionHeading>Your recent flights</SectionHeading>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {flights.map((f) => (
          <li key={f.id}>
            <Link
              href={`/flights/${f.id}`}
              className="flex min-h-12 items-center justify-between gap-4 px-4 py-2 hover:bg-muted"
            >
              <span>
                <span className="font-medium">{f.tailNumber}</span>{" "}
                <span className="text-muted-foreground">
                  {formatDate(f.date, { weekday: true })}
                </span>
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatHours(parseHours(f.billedHours)!)} h
                {canEditFlight(f, member.id) && " · editable"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

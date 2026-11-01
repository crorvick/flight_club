import { cn } from "cn";
import { and, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import {
  aircraft,
  dispatch,
  dispatchMeterReading,
  member as memberTable,
} from "@/db/schema";
import { hasRole } from "@/lib/access";
import { canEditFlight } from "@/lib/flight-rules";
import { formatHours, parseHours } from "@/lib/hours";
import { isPending } from "@/lib/member-rules";
import { getCurrentMember, type Member } from "@/lib/session";

import { signOut } from "./(auth)/actions";
import { recentFlights } from "./(member)/flights/data";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-8 md:max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Flight Club</h1>
      <p className="text-muted-foreground">
        Log flights, report squawks and keep track of the fleet.
      </p>
      {/* Reads the session, so it streams in after the static shell. */}
      <Suspense fallback={<div className="h-11" />}>
        <MemberStatus />
      </Suspense>
    </main>
  );
}

async function MemberStatus() {
  const member = await getCurrentMember();

  if (!member) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Links styled as buttons: they navigate, so they stay links for
            screen readers. */}
        <Link
          href="/sign-in"
          className={cn(buttonVariants(), "h-11 text-base")}
        >
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-11 text-base",
          )}
        >
          Create account
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {member.active ? (
        <>
          <p>
            Signed in as <span className="font-medium">{member.name}</span>
            {member.roles.length > 0 && <> ({member.roles.join(", ")})</>}.
          </p>
          {hasRole(member, "pilot") && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <FlyButton member={member} />
                <Link
                  href="/squawks/new"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "h-12 text-base",
                  )}
                >
                  Report a squawk
                </Link>
              </div>
              <Link
                href="/qualifications"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-11 text-base",
                )}
              >
                My qualifications
              </Link>
              <RecentFlights member={member} />
            </>
          )}
          <Link
            href="/fleet"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-11 text-base",
            )}
          >
            Fleet status and squawks
          </Link>
          {hasRole(member, "officer") && <OfficerLinks />}
        </>
      ) : isPending(member) ? (
        <p role="status">
          Thanks, {member.name}. Your account is waiting for an officer to
          approve it.
        </p>
      ) : (
        <p role="status">
          Your account has been deactivated. If that&apos;s a mistake, ask an
          officer.
        </p>
      )}
      <form action={signOut}>
        <Button type="submit" variant="outline" className="h-11 text-base">
          Sign out
        </Button>
      </form>
    </div>
  );
}

async function RecentFlights({ member }: { member: Member }) {
  const flights = await recentFlights(member.id);
  if (flights.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Your recent flights</h2>
      <ul className="divide-y rounded-lg border">
        {flights.map((f) => (
          <li key={f.id}>
            <Link
              href={`/flights/${f.id}`}
              className="flex min-h-12 items-center justify-between gap-4 px-3 py-2 hover:bg-muted"
            >
              <span>
                <span className="font-medium">{f.tailNumber}</span>{" "}
                <span className="text-muted-foreground">{f.date}</span>
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

// Check in the aircraft the pilot has out, or check one out.
async function FlyButton({ member }: { member: Member }) {
  const [out] = await db()
    .select({ id: dispatch.id, tailNumber: aircraft.tailNumber })
    .from(dispatch)
    .innerJoin(aircraft, eq(aircraft.id, dispatch.aircraftId))
    .where(and(eq(dispatch.pilotId, member.id), eq(dispatch.status, "out")));
  return out ? (
    <Link
      href={`/dispatches/${out.id}`}
      className={cn(buttonVariants(), "h-12 text-base")}
    >
      Check in {out.tailNumber}
    </Link>
  ) : (
    <Link href="/check-out" className={cn(buttonVariants(), "h-12 text-base")}>
      Check out an aircraft
    </Link>
  );
}

// Dispatches whose meters read more than the app expected, not yet
// accounted for by an officer.
async function GapsToReview() {
  const gaps = await db()
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
  if (gaps.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">Unlogged time to account for</h3>
      <ul className="divide-y rounded-lg border border-amber-600/40">
        {gaps.map((g) => (
          <li key={g.id}>
            <Link
              href={`/dispatches/${g.id}`}
              className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 hover:bg-muted"
            >
              <span className="font-medium">{g.tailNumber}</span>
              <span className="text-sm text-muted-foreground">
                found by {g.pilot}, {g.at.toISOString().slice(0, 10)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function OfficerLinks() {
  // Same test as isPending, as a query: inactive and never given a role.
  const [{ pending }] = await db()
    .select({ pending: count() })
    .from(memberTable)
    .where(
      and(
        eq(memberTable.active, false),
        sql`cardinality(${memberTable.roles}) = 0`,
      ),
    );
  const linkClass = cn(
    buttonVariants({ variant: "outline" }),
    "h-11 justify-between text-base",
  );
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Officer</h2>
      <Link href="/aircraft" className={linkClass}>
        Aircraft and meters
      </Link>
      <Link href="/members" className={linkClass}>
        Members
        {pending > 0 && (
          <span className="rounded-full bg-primary px-2 text-sm text-primary-foreground">
            {pending} waiting
          </span>
        )}
      </Link>
      <GapsToReview />
    </section>
  );
}

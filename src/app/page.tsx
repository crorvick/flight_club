import { cn } from "cn";
import Link from "next/link";
import { Suspense } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { hasRole } from "@/lib/access";
import { canEditFlight } from "@/lib/flight-rules";
import { formatHours, parseHours } from "@/lib/hours";
import { getCurrentMember, type Member } from "@/lib/session";

import { signOut } from "./(auth)/actions";
import { recentFlights } from "./flights/data";

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
              <Link
                href="/flights/new"
                className={cn(buttonVariants(), "h-12 text-base")}
              >
                Log a flight
              </Link>
              <RecentFlights member={member} />
            </>
          )}
        </>
      ) : (
        <p role="status">
          Thanks, {member.name}. Your account is waiting for an officer to
          approve it.
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

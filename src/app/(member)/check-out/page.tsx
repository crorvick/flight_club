import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AircraftPicker } from "@/components/aircraft-picker";
import { PreflightWarnings } from "@/components/preflight-warnings";
import { db } from "@/db";
import { dispatch } from "@/db/schema";
import { activeDispatches, listActiveAircraft, today } from "@/lib/fleet";
import { pilotStatus } from "@/lib/pilots";
import { pilotWarnings } from "@/lib/qualifications";
import { requireMember } from "@/lib/session";

import { checkOut } from "../dispatches/actions";
import { getAircraftForCheckOut, lastFlownAircraftId } from "../flights/data";
import { CheckOutForm } from "./check-out-form";

export const metadata: Metadata = { title: "Check out · Flight Club" };

export default function CheckOutPage({
  searchParams,
}: PageProps<"/check-out">) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Check out an aircraft
      </h1>
      {/* Reads the session and the URL, so it streams in after the shell. */}
      <Suspense fallback={<div className="h-96" />}>
        <CheckOut searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CheckOut({
  searchParams,
}: Pick<PageProps<"/check-out">, "searchParams">) {
  const member = await requireMember("pilot");

  // A pilot flies one aircraft at a time: one already out means check in.
  const [mine] = await db()
    .select({ id: dispatch.id })
    .from(dispatch)
    .where(and(eq(dispatch.pilotId, member.id), eq(dispatch.status, "out")));
  if (mine) redirect(`/dispatches/${mine.id}`);

  const fleet = await listActiveAircraft();
  if (fleet.length === 0) {
    return <p>There are no aircraft yet. An officer needs to add them.</p>;
  }

  // The aircraft in the URL if it's a real one, else the one this pilot
  // flew last, else the first.
  const { aircraft: requested, cancelled } = await searchParams;
  const candidates = [
    typeof requested === "string" ? requested : undefined,
    await lastFlownAircraftId(member.id),
  ];
  const selectedId =
    candidates.find((id) => fleet.some((a) => a.id === id)) ?? fleet[0].id;
  const plane = (await getAircraftForCheckOut(selectedId))!;
  const date = today();
  const [warnings, out] = await Promise.all([
    pilotStatus(member.id, plane.id).then((s) => pilotWarnings(s, date)),
    activeDispatches([plane.id]).then((d) => d.get(plane.id)),
  ]);

  return (
    <>
      {cancelled && (
        <p role="status" className="rounded-lg bg-muted p-4 font-medium">
          Cancelled. No flight was recorded.
        </p>
      )}
      <AircraftPicker fleet={fleet} selectedId={plane.id} path="/check-out" />
      <PreflightWarnings
        tailNumber={plane.tailNumber}
        alerts={plane.alerts}
        pilot={warnings}
      />
      {plane.alerts.grounded ? (
        <p className="font-medium">
          {plane.tailNumber} can&apos;t be checked out until an officer returns
          it to service.
        </p>
      ) : out ? (
        <p className="font-medium">
          {plane.tailNumber} is checked out to {out.pilotName}.
        </p>
      ) : (
        // Keyed so switching aircraft starts with a fresh form.
        <CheckOutForm
          key={plane.id}
          action={checkOut.bind(null, plane.id)}
          tailNumber={plane.tailNumber}
          meters={plane.meters}
          squawks={plane.squawks}
        />
      )}
    </>
  );
}

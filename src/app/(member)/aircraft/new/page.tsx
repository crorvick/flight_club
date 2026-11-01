import type { Metadata } from "next";
import { Suspense } from "react";

import { METER_DISPLAY_ORDER } from "@/lib/meters";
import { requireMember } from "@/lib/session";

import { createAircraft } from "../actions";
import { NewAircraftForm } from "../aircraft-forms";

export const metadata: Metadata = { title: "Add an aircraft · Flight Club" };

export default function NewAircraftPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Add an aircraft</h1>
      <Suspense fallback={<div className="h-96" />}>
        <NewAircraft />
      </Suspense>
    </>
  );
}

async function NewAircraft() {
  await requireMember("officer");
  return (
    <NewAircraftForm action={createAircraft} kinds={METER_DISPLAY_ORDER} />
  );
}

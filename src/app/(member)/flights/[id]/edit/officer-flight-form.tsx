"use client";

import { useActionState, useState } from "react";

import { Field, FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { checkReading } from "@/lib/flight-rules";
import type { FormState } from "@/lib/form-state";
import { formatHours, parseHours } from "@/lib/hours";

import { inField, outField } from "../../fields";
import {
  FluidFields,
  type FluidSetup,
  type FluidValues,
} from "../../fluid-fields";

// Readings as stored, or blank for a flight being added.
type Reading = { meterId: string; label: string; out: string; in: string };

const show = (reading: string) =>
  reading ? formatHours(parseHours(reading)!) : "";

// Every field of a flight, for an officer or the aircraft's captain:
// correcting one, or adding one that wasn't logged at the time.
export function OfficerFlightForm({
  action,
  pilots,
  flight,
  fluids,
  readings,
  meterNote,
  reasonLabel,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  pilots: { id: string; name: string }[];
  // Blank fields for a new flight.
  flight: {
    pilotId: string;
    date: string;
    notes: string;
  } & FluidValues;
  fluids: FluidSetup;
  readings: Reading[];
  meterNote: string;
  reasonLabel: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const values = state.values;
  const errors = state.fieldErrors ?? {};

  // Typed readings, for the live durations.
  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      readings.flatMap((r) => [
        [outField(r.meterId), show(r.out)],
        [inField(r.meterId), show(r.in)],
      ]),
    ),
  );
  const field = (name: string) => values?.[name] ?? typed[name];

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormError message={state.error} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="pilotId">Pilot</Label>
        {/* Keyed on the choice: a select doesn't pick up a new default
            when the form resets after a rejected save. */}
        <select
          key={values?.pilotId ?? flight.pilotId}
          id="pilotId"
          name="pilotId"
          defaultValue={values?.pilotId ?? flight.pilotId}
          className="h-11 rounded-lg border border-input bg-transparent px-2 text-base"
        >
          {!flight.pilotId && (
            <option value="" disabled>
              Choose the pilot…
            </option>
          )}
          {pilots.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {errors.pilotId && (
          <p className="text-sm text-destructive">{errors.pilotId[0]}</p>
        )}
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">Meters</legend>
        <p className="text-sm text-muted-foreground">{meterNote}</p>
        {readings.map((r) => {
          const out = parseHours(typed[outField(r.meterId)] ?? "");
          const inTyped = typed[inField(r.meterId)] ?? "";
          const check =
            out === null
              ? null
              : checkReading(out, inTyped, parseHours(inTyped));
          return (
            <div key={r.meterId} className="flex flex-col gap-1">
              <div className="grid grid-cols-2 gap-3">
                {(["out", "in"] as const).map((end) => {
                  const name =
                    end === "out" ? outField(r.meterId) : inField(r.meterId);
                  return (
                    <Field
                      key={end}
                      name={name}
                      label={`${r.label} ${end}`}
                      inputMode="decimal"
                      autoComplete="off"
                      defaultValue={field(name)}
                      onChange={(e) =>
                        setTyped((prev) => ({
                          ...prev,
                          [name]: e.target.value,
                        }))
                      }
                      errors={errors[name]}
                    />
                  );
                })}
              </div>
              <p className="min-h-5 text-sm text-muted-foreground">
                {check?.status === "ok" &&
                  `${formatHours(check.duration)} hours${check.warning ? `. ${check.warning}` : ""}`}
              </p>
            </div>
          );
        })}
      </fieldset>

      <FluidFields
        fluids={fluids}
        values={values}
        initial={flight}
        errors={errors}
      />

      <Field
        name="date"
        label="Date"
        type="date"
        defaultValue={values?.date ?? flight.date}
        errors={errors.date}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={values?.notes ?? flight.notes}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </div>

      <Field
        name="reason"
        label={reasonLabel}
        defaultValue={values?.reason}
        errors={errors.reason}
      />

      <Button type="submit" className="h-12 text-base" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

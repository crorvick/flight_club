"use client";

import { cn } from "cn";
import { useActionState, useEffect, useRef, useState } from "react";

import { Field, FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkReading } from "@/lib/flight-rules";
import type { FormState } from "@/lib/form-state";
import { formatHours, parseHours } from "@/lib/hours";

import { inField } from "./fields";

export type FormMeter = {
  id: string;
  label: string;
  // Decimal string, as stored.
  out: string;
  billing: boolean;
};

type FlightFormProps = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  meters: FormMeter[];
  initial?: {
    date: string;
    notes: string;
    ins: Record<string, string>;
  };
  submitLabel: string;
  pendingLabel: string;
  // Offer to go straight on to reporting a squawk on this aircraft.
  offerSquawk?: boolean;
};

// Today in the member's own time zone, which the server doesn't know.
function localToday() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function FlightForm({
  action,
  meters,
  initial,
  submitLabel,
  pendingLabel,
  offerSquawk = false,
}: FlightFormProps) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const values = state.values;

  // What's typed in each meter, for the live durations.  The inputs
  // themselves stay uncontrolled, so anything typed before the page
  // hydrates on a slow connection is kept rather than overwritten.
  const [ins, setIns] = useState<Record<string, string>>(
    () => initial?.ins ?? {},
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Filled in after hydration: rendering today's date on the server would
  // use the server's time zone and mismatch on the client.
  const dateRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (dateRef.current && !dateRef.current.value) {
      dateRef.current.value = localToday();
    }
    // Readings typed before hydration fired no change events; pick them
    // up so their durations show.
    const form = formRef.current;
    if (!form) return;
    const typed = Object.fromEntries(
      meters.map((m) => [
        m.id,
        String(new FormData(form).get(inField(m.id)) ?? ""),
      ]),
    );
    setIns((prev) => ({ ...prev, ...typed }));
  }, [meters]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-6"
      noValidate
    >
      <FormError message={state.error} />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold">Meters</legend>
        {meters.map((m) => (
          <MeterInput
            key={m.id}
            meter={m}
            value={ins[m.id] ?? ""}
            defaultValue={values?.[inField(m.id)] ?? initial?.ins[m.id]}
            onChange={(v) => setIns((prev) => ({ ...prev, [m.id]: v }))}
            touched={touched[m.id] ?? false}
            onBlur={() => setTouched((prev) => ({ ...prev, [m.id]: true }))}
            serverError={state.fieldErrors?.[inField(m.id)]?.[0]}
          />
        ))}
      </fieldset>

      <Field
        ref={dateRef}
        name="date"
        label="Date"
        type="date"
        defaultValue={values?.date ?? initial?.date}
        errors={state.fieldErrors?.date}
        required
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={values?.notes ?? initial?.notes}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        {state.fieldErrors?.notes && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.notes[0]}
          </p>
        )}
      </div>

      {offerSquawk && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-base has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
          <input
            type="checkbox"
            name="reportSquawk"
            defaultChecked={values?.reportSquawk === "on"}
            className="size-5 accent-primary"
          />
          Report a squawk after logging
        </label>
      )}

      <Button type="submit" className="h-12 text-base" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

function MeterInput({
  meter,
  value,
  defaultValue,
  onChange,
  touched,
  onBlur,
  serverError,
}: {
  meter: FormMeter;
  value: string;
  defaultValue?: string;
  onChange: (value: string) => void;
  touched: boolean;
  onBlur: () => void;
  serverError?: string;
}) {
  const id = inField(meter.id);
  const out = parseHours(meter.out)!;
  const check = checkReading(out, value, parseHours(value));
  // Don't complain about "12" while the pilot is still typing "1234.5".
  const error =
    serverError ?? (touched && check.status === "invalid" ? check.message : "");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-base">
          {meter.label} in
          {meter.billing && (
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
              billed
            </span>
          )}
        </Label>
        <span className="text-sm text-muted-foreground tabular-nums">
          out {formatHours(out)}
        </span>
      </div>
      <Input
        id={id}
        name={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder={formatHours(out)}
        defaultValue={defaultValue}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-status`}
        className="h-11 text-lg tabular-nums md:text-lg"
      />
      <p
        id={`${id}-status`}
        aria-live="polite"
        className={cn(
          "min-h-5 text-sm",
          error
            ? "text-destructive"
            : check.status === "ok" && check.warning
              ? "font-medium text-amber-700 dark:text-amber-400"
              : "text-muted-foreground",
        )}
      >
        {error ||
          (check.status === "ok" &&
            `${formatHours(check.duration)} hours${check.warning ? `. ${check.warning}` : ""}`)}
      </p>
    </div>
  );
}

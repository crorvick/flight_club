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

import { inField, outField } from "./fields";

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
  // Logging sends the out readings the pilot saw, so the server can tell
  // if someone else logged a flight in the meantime.  Editing doesn't:
  // a logged flight's out readings never change.
  sendOuts: boolean;
  initial?: {
    date: string;
    dayLandings: number;
    nightLandings: number;
    notes: string;
    ins: Record<string, string>;
  };
  submitLabel: string;
  pendingLabel: string;
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
  sendOuts,
  initial,
  submitLabel,
  pendingLabel,
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
  const [dayLandings, setDayLandings] = useState(initial?.dayLandings ?? 1);
  const [nightLandings, setNightLandings] = useState(
    initial?.nightLandings ?? 0,
  );

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
            sendOut={sendOuts}
            value={ins[m.id] ?? ""}
            defaultValue={values?.[inField(m.id)] ?? initial?.ins[m.id]}
            onChange={(v) => setIns((prev) => ({ ...prev, [m.id]: v }))}
            touched={touched[m.id] ?? false}
            onBlur={() => setTouched((prev) => ({ ...prev, [m.id]: true }))}
            serverError={state.fieldErrors?.[inField(m.id)]?.[0]}
          />
        ))}
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <Stepper
          name="dayLandings"
          label="Day landings"
          value={dayLandings}
          onChange={setDayLandings}
          error={state.fieldErrors?.dayLandings?.[0]}
        />
        <Stepper
          name="nightLandings"
          label="Night landings"
          value={nightLandings}
          onChange={setNightLandings}
          error={state.fieldErrors?.nightLandings?.[0]}
        />
      </div>

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

      <Button type="submit" className="h-12 text-base" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

function MeterInput({
  meter,
  sendOut,
  value,
  defaultValue,
  onChange,
  touched,
  onBlur,
  serverError,
}: {
  meter: FormMeter;
  sendOut: boolean;
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
      {sendOut && (
        <input type="hidden" name={outField(meter.id)} value={meter.out} />
      )}
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

function Stepper({
  name,
  label,
  value,
  onChange,
  error,
}: {
  name: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  error?: string;
}) {
  const lower = label.toLowerCase();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          className="size-11 text-xl"
          aria-label={`Fewer ${lower}`}
          disabled={value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −
        </Button>
        <input
          id={name}
          name={name}
          value={value}
          readOnly
          className="h-11 w-full min-w-0 bg-transparent text-center text-lg tabular-nums outline-none"
        />
        <Button
          type="button"
          variant="outline"
          className="size-11 text-xl"
          aria-label={`More ${lower}`}
          disabled={value >= 99}
          onClick={() => onChange(Math.min(99, value + 1))}
        >
          +
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

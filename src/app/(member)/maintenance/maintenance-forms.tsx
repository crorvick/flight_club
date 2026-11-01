"use client";

import { useActionState, useEffect, useRef } from "react";

import { Field, FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/form-state";
import { formatHours, parseHours } from "@/lib/hours";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const display = (hours: string | null) =>
  hours === null ? "" : formatHours(parseHours(hours)!);

function ErrorText({ errors }: { errors?: string[] }) {
  if (!errors) return null;
  return <p className="text-sm text-destructive">{errors[0]}</p>;
}

export type ItemValues = {
  name: string;
  intervalMonths: number | null;
  intervalHours: string | null;
  meterId: string | null;
  lastCompletedOn: string | null;
  lastCompletedReading: string | null;
  groundsWhenOverdue: boolean;
};

export function ItemForm({
  action,
  meters,
  item,
  submitLabel,
}: {
  action: Action;
  meters: { id: string; label: string }[];
  item?: ItemValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const values = state.values;
  const errors = state.fieldErrors ?? {};
  // Most hours intervals count on the tach.
  const defaultMeter =
    meters.find((m) => m.label === "Tach")?.id ?? meters[0]?.id;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        name="name"
        label="Name"
        placeholder="Annual inspection"
        defaultValue={values?.name ?? item?.name}
        errors={errors.name}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium">
          Due every… (either or both; whichever comes first)
        </legend>
        <Field
          name="intervalMonths"
          label="Calendar months"
          inputMode="numeric"
          placeholder="12"
          defaultValue={
            values?.intervalMonths ?? item?.intervalMonths?.toString()
          }
          errors={errors.intervalMonths}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            name="intervalHours"
            label="Hours"
            inputMode="decimal"
            placeholder="100"
            defaultValue={
              values?.intervalHours ?? display(item?.intervalHours ?? null)
            }
            errors={errors.intervalHours}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="meterId">On the</Label>
            <select
              id="meterId"
              name="meterId"
              defaultValue={values?.meterId ?? item?.meterId ?? defaultMeter}
              className="h-11 rounded-lg border border-input bg-transparent px-2 text-base"
            >
              {meters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <ErrorText errors={errors.meterId} />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium">Last done</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field
            name="lastCompletedOn"
            label="Date"
            type="date"
            defaultValue={
              values?.lastCompletedOn ?? item?.lastCompletedOn ?? ""
            }
            errors={errors.lastCompletedOn}
          />
          <Field
            name="lastCompletedReading"
            label="At meter reading"
            inputMode="decimal"
            placeholder="For an hours interval"
            defaultValue={
              values?.lastCompletedReading ??
              display(item?.lastCompletedReading ?? null)
            }
            errors={errors.lastCompletedReading}
          />
        </div>
      </fieldset>

      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2">
        <input
          type="checkbox"
          name="groundsWhenOverdue"
          defaultChecked={
            values
              ? values.groundsWhenOverdue === "on"
              : (item?.groundsWhenOverdue ?? true)
          }
          className="size-5 accent-primary"
        />
        <span>
          <span className="block font-medium">
            Grounds the aircraft when overdue
          </span>
          <span className="block text-sm text-muted-foreground">
            Otherwise it&apos;s only a warning before flight.
          </span>
        </span>
      </label>

      <Button type="submit" className="h-11 text-base" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

// Today in the officer's own time zone, as on the flight form.
function localToday() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function CompletionForm({
  action,
  meterLabel,
  currentReading,
}: {
  action: Action;
  // Set when the item has an hours interval.
  meterLabel?: string;
  currentReading?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const values = state.values;
  const errors = state.fieldErrors ?? {};
  const dateRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (dateRef.current && !dateRef.current.value) {
      dateRef.current.value = localToday();
    }
  }, []);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border p-4"
      noValidate
    >
      <h2 className="text-lg font-semibold">Log completion</h2>
      <FormError message={state.error} />
      <div className="grid grid-cols-2 gap-3">
        <Field
          ref={dateRef}
          id="completedOn"
          name="completedOn"
          label="Done on"
          type="date"
          defaultValue={values?.completedOn}
          errors={errors.completedOn}
        />
        {meterLabel && (
          <Field
            id="completedReading"
            name="reading"
            label={`${meterLabel} reading`}
            inputMode="decimal"
            defaultValue={values?.reading ?? display(currentReading ?? null)}
            errors={errors.reading}
          />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="completionNote">Note (optional)</Label>
        <textarea
          id="completionNote"
          name="note"
          rows={2}
          placeholder="Who did it, work order number…"
          defaultValue={values?.note}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <ErrorText errors={errors.note} />
      </div>
      <Button type="submit" className="h-11 text-base" disabled={pending}>
        {pending ? "Saving…" : "Log completion"}
      </Button>
    </form>
  );
}

export function DeleteItemForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return (
    <form action={formAction}>
      <FormError message={state.error} />
      <Button
        type="submit"
        variant="ghost"
        className="h-11 w-full text-base text-destructive"
        disabled={pending}
      >
        Remove this item
      </Button>
    </form>
  );
}

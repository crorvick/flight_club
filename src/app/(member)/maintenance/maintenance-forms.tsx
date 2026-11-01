"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Field, FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/form-state";
import type { Grounding } from "@/lib/grounding";
import { engineLabels } from "@/lib/engines";
import { formatHours, parseHours } from "@/lib/hours";
import {
  FIELDS,
  KIND_LABELS,
  MAINTENANCE_KINDS,
  type MaintenanceKind,
  VOR_LIMITS,
  VOR_METHOD_LABELS,
  VOR_METHODS,
  type VorMethod,
} from "@/lib/maintenance-kinds";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const display = (hours: string | null) =>
  hours === null ? "" : formatHours(parseHours(hours)!);

function ErrorText({ errors }: { errors?: string[] }) {
  if (!errors) return null;
  return <p className="text-sm text-destructive">{errors[0]}</p>;
}

export type ItemValues = {
  name: string;
  kind: MaintenanceKind;
  intervalMonths: number | null;
  intervalDays: number | null;
  dueEndOfMonth: boolean;
  intervalHours: string | null;
  lastCompletedOn: string | null;
  lastCompletedReading: string | null;
  grounding: Grounding;
};

export function ItemForm({
  action,
  logbookMeter,
  item,
  submitLabel,
}: {
  action: Action;
  // The label of the meter hours intervals count on, if one is chosen.
  logbookMeter?: string;
  item?: ItemValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const values = state.values;
  const errors = state.fieldErrors ?? {};

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
      <div className="flex flex-col gap-2">
        <Label htmlFor="kind">Kind</Label>
        <select
          id="kind"
          name="kind"
          defaultValue={values?.kind ?? item?.kind ?? "general"}
          className="h-11 rounded-lg border border-input bg-transparent px-2 text-base"
        >
          {MAINTENANCE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          What logging it asks for: a VOR check its bearing errors, an oil
          change the oil put in. General is a date and a note.
        </p>
        <ErrorText errors={errors.kind} />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium">
          Due every… (either or both; whichever comes first)
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <Field
            name="calendarInterval"
            label="Calendar time"
            inputMode="numeric"
            placeholder="12"
            defaultValue={
              values?.calendarInterval ??
              (item?.intervalMonths ?? item?.intervalDays)?.toString()
            }
            errors={errors.calendarInterval}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="calendarUnit">In</Label>
            <select
              id="calendarUnit"
              name="calendarUnit"
              defaultValue={
                values?.calendarUnit ?? (item?.intervalDays ? "days" : "months")
              }
              className="h-11 rounded-lg border border-input bg-transparent px-2 text-base"
            >
              <option value="months">months</option>
              <option value="days">days</option>
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium">For months, due</span>
          {(
            [
              ["end-of-month", "By the end of the month (annual, ELT)"],
              ["exact", "To the day"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-3"
            >
              <input
                type="radio"
                name="calendarDeadline"
                value={value}
                defaultChecked={
                  (values?.calendarDeadline ??
                    (item && !item.dueEndOfMonth
                      ? "exact"
                      : "end-of-month")) === value
                }
                className="size-5 accent-primary"
              />
              {label}
            </label>
          ))}
          <span className="text-muted-foreground">
            Days are always to the day, e.g. a VOR check every 30 days.
          </span>
        </div>
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
        <p className="-mt-1 text-sm text-muted-foreground">
          {logbookMeter
            ? `Counted on the ${logbookMeter.toLowerCase()}, the aircraft's logbook time.`
            : "Choose which meter is the aircraft's logbook time to count hours."}
        </p>
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
            label="Logbook reading"
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

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">When it&apos;s overdue</legend>
        {(
          [
            ["all", "Ground the aircraft", "e.g. annual, 100-hour"],
            ["ifr", "Ground it for IFR only", "e.g. VOR check, pitot-static"],
            ["none", "Only warn", "e.g. oil change"],
          ] as const
        ).map(([value, label, example]) => (
          <label
            key={value}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2"
          >
            <input
              type="radio"
              name="grounding"
              value={value}
              defaultChecked={
                (values?.grounding ?? item?.grounding ?? "all") === value
              }
              className="size-5 accent-primary"
            />
            <span>
              <span className="block font-medium">{label}</span>
              <span className="block text-sm text-muted-foreground">
                {example}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

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
  kind,
  engines,
  lastOilType,
  meterLabel,
  currentReading,
}: {
  action: Action;
  kind: MaintenanceKind;
  // The aircraft's, for an oil change's per-engine amounts.
  engines: number;
  // What the last oil change on the aircraft used, to suggest.
  lastOilType?: string;
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
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
      noValidate
    >
      <h2 className="text-base font-semibold">Log completion</h2>
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
      {kind === "vor_check" && (
        <VorCheckFields values={values} errors={errors} />
      )}
      {kind === "oil_change" && (
        <OilChangeFields
          engines={engines}
          lastOilType={lastOilType}
          values={values}
          errors={errors}
        />
      )}
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

type KindFieldsProps = {
  values?: Record<string, string>;
  errors: Partial<Record<string, string[]>>;
};

// What 14 CFR 91.171 asks to be recorded: how and where it was checked,
// and the bearing error found, within the limit for the method.
function VorCheckFields({ values, errors }: KindFieldsProps) {
  const [method, setMethod] = useState<VorMethod>(
    (values?.[FIELDS.vorMethod] as VorMethod) || "vot",
  );
  const limit = VOR_LIMITS[method];
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 font-medium">VOR check</legend>
      <div className="flex flex-col gap-2">
        <Label htmlFor={FIELDS.vorMethod}>Checked against</Label>
        <select
          id={FIELDS.vorMethod}
          name={FIELDS.vorMethod}
          value={method}
          onChange={(e) => setMethod(e.target.value as VorMethod)}
          className="h-11 rounded-lg border border-input bg-transparent px-2 text-base"
        >
          {VOR_METHODS.map((m) => (
            <option key={m} value={m}>
              {VOR_METHOD_LABELS[m]} (±{VOR_LIMITS[m]}°)
            </option>
          ))}
        </select>
        <ErrorText errors={errors[FIELDS.vorMethod]} />
      </div>
      <Field
        name={FIELDS.vorPlace}
        label="Where"
        placeholder={
          method === "vot"
            ? "KMSP VOT"
            : method === "dual"
              ? "Over the GEP VOR"
              : "FCM checkpoint, runway 28R run-up"
        }
        defaultValue={values?.[FIELDS.vorPlace]}
        errors={errors[FIELDS.vorPlace]}
      />
      {method === "dual" ? (
        <Field
          name={FIELDS.vorBetween}
          label="Difference between receivers (°)"
          inputMode="decimal"
          defaultValue={values?.[FIELDS.vorBetween]}
          errors={errors[FIELDS.vorBetween]}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field
            name={FIELDS.vorNav1}
            label="NAV 1 error (°)"
            inputMode="decimal"
            placeholder="+2"
            defaultValue={values?.[FIELDS.vorNav1]}
            errors={errors[FIELDS.vorNav1]}
          />
          <Field
            name={FIELDS.vorNav2}
            label="NAV 2 error (°)"
            inputMode="decimal"
            placeholder="Blank if none"
            defaultValue={values?.[FIELDS.vorNav2]}
            errors={errors[FIELDS.vorNav2]}
          />
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Within ±{limit}° for this check. Logging it records you as the person
        who made it.
      </p>
    </fieldset>
  );
}

// The oil put in each engine and what it was, suggesting last time's.
function OilChangeFields({
  engines,
  lastOilType,
  values,
  errors,
}: KindFieldsProps & { engines: number; lastOilType?: string }) {
  const labels = engineLabels(engines);
  const check = "flex min-h-11 cursor-pointer items-center gap-3";
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 font-medium">Oil change</legend>
      <div className="grid grid-cols-2 gap-3">
        {labels.map((label, engine) => (
          <Field
            key={engine}
            name={FIELDS.oilQuarts(engine)}
            label={
              label
                ? `Oil put in, ${label.toLowerCase()} (qt)`
                : "Oil put in (qt)"
            }
            inputMode="decimal"
            defaultValue={values?.[FIELDS.oilQuarts(engine)]}
            errors={errors[FIELDS.oilQuarts(engine)]}
          />
        ))}
      </div>
      <Field
        name={FIELDS.oilType}
        label="Oil used"
        placeholder="AeroShell W100"
        defaultValue={values?.[FIELDS.oilType] ?? lastOilType}
        errors={errors[FIELDS.oilType]}
      />
      <label className={check}>
        <input
          type="checkbox"
          name={FIELDS.oilFilter}
          defaultChecked={(values?.[FIELDS.oilFilter] ?? "on") === "on"}
          className="size-5 accent-primary"
        />
        Filter replaced
      </label>
      <label className={check}>
        <input
          type="checkbox"
          name={FIELDS.oilSample}
          defaultChecked={values?.[FIELDS.oilSample] === "on"}
          className="size-5 accent-primary"
        />
        Oil sample sent for analysis
      </label>
    </fieldset>
  );
}

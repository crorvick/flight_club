"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";

import { Field, FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";
import { formatHours, parseHours } from "@/lib/hours";
import { METER_LABELS, type MeterKind } from "@/lib/meters";

import { readingField } from "./fields";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function useForm(action: Action) {
  return useActionState(action, {} as FormState);
}

function Saving({
  pending,
  label,
  variant = "default",
}: {
  pending: boolean;
  label: string;
  variant?: "default" | "outline";
}) {
  return (
    <Button
      type="submit"
      variant={variant}
      className="h-11 text-base"
      disabled={pending}
    >
      {pending ? "Saving…" : label}
    </Button>
  );
}

function ErrorText({ errors }: { errors?: string[] }) {
  if (!errors) return null;
  return <p className="text-sm text-destructive">{errors[0]}</p>;
}

const display = (reading: string) => formatHours(parseHours(reading)!);

export function NewAircraftForm({
  action,
  kinds,
}: {
  action: Action;
  kinds: readonly MeterKind[];
}) {
  const [state, formAction, pending] = useForm(action);
  const values = state.values;
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormError message={state.error} />
      <Field
        name="tailNumber"
        label="Tail number"
        autoCapitalize="characters"
        autoComplete="off"
        defaultValue={values?.tailNumber}
        errors={errors.tailNumber}
      />
      <Field
        name="makeModel"
        label="Make and model"
        defaultValue={values?.makeModel}
        errors={errors.makeModel}
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 font-semibold">Meters</legend>
        <p className="text-sm text-muted-foreground">
          Enter the current reading of each meter it has; leave the others
          blank. Then choose the one flights are billed by, and the one that is
          its time in the maintenance logs (usually the tach).
        </p>
        {kinds.map((kind) => (
          <div key={kind} className="flex items-end gap-3">
            <div className="flex-1">
              <Field
                name={readingField(kind)}
                label={METER_LABELS[kind]}
                inputMode="decimal"
                autoComplete="off"
                defaultValue={values?.[readingField(kind)]}
                errors={errors[readingField(kind)]}
              />
            </div>
            <label className="flex h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="billing"
                value={kind}
                defaultChecked={values?.billing === kind}
                className="size-5 accent-primary"
              />
              Bills
              <span className="sr-only"> by {METER_LABELS[kind]}</span>
            </label>
            <label className="flex h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="logbook"
                value={kind}
                defaultChecked={(values?.logbook ?? "tach") === kind}
                className="size-5 accent-primary"
              />
              Logbook
              <span className="sr-only"> time on {METER_LABELS[kind]}</span>
            </label>
          </div>
        ))}
        <ErrorText errors={errors.billing} />
        <ErrorText errors={errors.logbook} />
      </fieldset>

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="hasFuelTotalizer"
          defaultChecked={values?.hasFuelTotalizer === "on"}
          className="size-5 accent-primary"
        />
        <span>
          Has a fuel totalizer{" "}
          <span className="text-sm text-muted-foreground">
            (pilots record its fuel remaining at check-in)
          </span>
        </span>
      </label>

      <Saving pending={pending} label="Add aircraft" />
    </form>
  );
}

export function DetailsForm({
  action,
  aircraft,
  meters,
}: {
  action: Action;
  aircraft: {
    tailNumber: string;
    makeModel: string;
    active: boolean;
    hasFuelTotalizer: boolean;
    billingMeterId: string | null;
    logbookMeterId: string | null;
  };
  meters: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useForm(action);
  const values = state.values;
  const errors = state.fieldErrors ?? {};
  const billing = values?.billing ?? aircraft.billingMeterId;
  const logbook = values?.logbook ?? aircraft.logbookMeterId;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        name="tailNumber"
        label="Tail number"
        autoCapitalize="characters"
        autoComplete="off"
        defaultValue={values?.tailNumber ?? aircraft.tailNumber}
        errors={errors.tailNumber}
      />
      <Field
        name="makeModel"
        label="Make and model"
        defaultValue={values?.makeModel ?? aircraft.makeModel}
        errors={errors.makeModel}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Billed by</legend>
        <div className="flex flex-wrap gap-2">
          {meters.map((m) => (
            <label
              key={m.id}
              className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-3"
            >
              <input
                type="radio"
                name="billing"
                value={m.id}
                defaultChecked={billing === m.id}
                className="size-5 accent-primary"
              />
              {m.label}
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Changes how future flights are billed; logged flights keep theirs.
        </p>
        <ErrorText errors={errors.billing} />
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Logbook time</legend>
        <div className="flex flex-wrap gap-2">
          {meters.map((m) => (
            <label
              key={m.id}
              className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-3"
            >
              <input
                type="radio"
                name="logbook"
                value={m.id}
                defaultChecked={logbook === m.id}
                className="size-5 accent-primary"
              />
              {m.label}
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Hours-based maintenance counts on it. Changing it moves those items
          over, each keeping the hours it has left.
        </p>
        <ErrorText errors={errors.logbook} />
      </fieldset>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="active"
          defaultChecked={aircraft.active}
          className="size-5 accent-primary"
        />
        <span>
          Active{" "}
          <span className="text-sm text-muted-foreground">
            (inactive aircraft can&apos;t be picked for flights or squawks)
          </span>
        </span>
      </label>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="hasFuelTotalizer"
          defaultChecked={aircraft.hasFuelTotalizer}
          className="size-5 accent-primary"
        />
        <span>
          Has a fuel totalizer{" "}
          <span className="text-sm text-muted-foreground">
            (pilots record its fuel remaining at check-in)
          </span>
        </span>
      </label>
      <Saving pending={pending} label="Save details" />
    </form>
  );
}

export function MeterForm({
  action,
  removeAction,
  meter,
  billing,
  logbook,
  removable,
}: {
  action: Action;
  removeAction: Action;
  meter: { id: string; label: string; reading: string };
  // Flights are billed by it.
  billing: boolean;
  // Hours-based maintenance counts on it.
  logbook: boolean;
  removable: boolean;
}) {
  const [state, formAction, pending] = useForm(action);
  const [removeState, remove, removing] = useForm(removeAction);
  const values = state.values;
  const errors = state.fieldErrors ?? {};
  const id = (name: string) => `${meter.id}-${name}`;
  const shown = display(meter.reading);
  // A changed reading is a correction and needs a reason; a new label
  // alone doesn't, so the reason is only asked for once it's needed.
  const [reading, setReading] = useState(values?.reading ?? shown);
  const correcting = reading.trim() !== shown || errors.reason !== undefined;

  return (
    <Collapsible.Root className="rounded-lg border">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {meter.label}
            {billing && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                billed
              </span>
            )}
            {logbook && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                logbook
              </span>
            )}
          </p>
          <p className="text-xl font-semibold tabular-nums">{shown}</p>
        </div>
        <Collapsible.Trigger
          aria-label={`Edit ${meter.label}`}
          render={
            <Button
              variant="outline"
              className="h-10 gap-1.5 px-3 data-panel-open:bg-muted"
            />
          }
        >
          <Pencil aria-hidden />
          Edit
        </Collapsible.Trigger>
      </div>
      <Collapsible.Panel className="flex flex-col gap-3 border-t p-3">
        <form action={formAction} className="flex flex-col gap-3" noValidate>
          <FormError message={state.error} />
          <div className="grid grid-cols-2 gap-3">
            <Field
              id={id("label")}
              name="label"
              label="Label"
              defaultValue={values?.label ?? meter.label}
              errors={errors.label}
            />
            <Field
              id={id("reading")}
              name="reading"
              label={`${values?.label ?? meter.label} reading`}
              inputMode="decimal"
              autoComplete="off"
              defaultValue={values?.reading ?? shown}
              onChange={(e) => setReading(e.target.value)}
              errors={errors.reading}
            />
          </div>
          {correcting && (
            <Field
              id={id("reason")}
              name="reason"
              label={`Reason for correcting ${meter.label}`}
              defaultValue={values?.reason}
              errors={errors.reason}
            />
          )}
          <Saving pending={pending} label={`Save ${meter.label}`} />
        </form>
        {removable && (
          <form action={remove}>
            <FormError message={removeState.error} />
            <Button
              type="submit"
              variant="ghost"
              className="h-11 w-full text-base text-destructive"
              disabled={removing}
            >
              Remove {meter.label}
            </Button>
          </form>
        )}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

export function AddMeterForm({
  action,
  kinds,
}: {
  action: Action;
  kinds: MeterKind[];
}) {
  const [state, formAction, pending] = useForm(action);
  const values = state.values;
  const errors = state.fieldErrors ?? {};
  if (kinds.length === 0) return null;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-dashed p-3"
      noValidate
    >
      <h3 className="text-sm font-medium">Add a meter</h3>
      <FormError message={state.error} />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="new-meter-kind" className="text-sm font-medium">
            Kind
          </label>
          <select
            id="new-meter-kind"
            name="kind"
            defaultValue={values?.kind ?? kinds[0]}
            className="h-11 rounded-lg border border-input bg-transparent px-2 text-base"
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {METER_LABELS[kind]}
              </option>
            ))}
          </select>
          <ErrorText errors={errors.kind} />
        </div>
        <Field
          id="new-meter-reading"
          name="reading"
          label="Current reading"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={values?.reading}
          errors={errors.reading}
        />
      </div>
      <Saving pending={pending} label="Add meter" variant="outline" />
    </form>
  );
}

export function CaptainList({
  captains,
}: {
  captains: { id: string; name: string; removeAction: Action }[];
}) {
  if (captains.length === 0) {
    return <p className="text-sm text-muted-foreground">None yet.</p>;
  }
  return (
    <ul className="divide-y rounded-lg border">
      {captains.map((c) => (
        <CaptainRow key={c.id} name={c.name} removeAction={c.removeAction} />
      ))}
    </ul>
  );
}

function CaptainRow({
  name,
  removeAction,
}: {
  name: string;
  removeAction: Action;
}) {
  const [state, remove, removing] = useForm(removeAction);
  return (
    <li className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 py-1">
      <span className="font-medium">{name}</span>
      <form action={remove}>
        <FormError message={state.error} />
        <Button
          type="submit"
          variant="ghost"
          aria-label={`Remove ${name} as captain`}
          className="h-10 text-destructive"
          disabled={removing}
        >
          Remove
        </Button>
      </form>
    </li>
  );
}

export function AddCaptainForm({
  action,
  candidates,
}: {
  action: Action;
  // Active members who aren't captains of this aircraft yet.
  candidates: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useForm(action);
  const errors = state.fieldErrors ?? {};
  if (candidates.length === 0) return null;
  return (
    <form action={formAction} className="flex flex-col gap-2" noValidate>
      <FormError message={state.error} />
      <label htmlFor="captain-member" className="text-sm font-medium">
        Add a captain
      </label>
      <div className="flex gap-2">
        <select
          id="captain-member"
          name="memberId"
          defaultValue={state.values?.memberId ?? ""}
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-base"
        >
          <option value="" disabled>
            Choose a member…
          </option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <Saving pending={pending} label="Add" variant="outline" />
      </div>
      <ErrorText errors={errors.memberId} />
    </form>
  );
}

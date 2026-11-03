"use client";

import { useActionState } from "react";

import { Field, FormError } from "@/components/field";
import { FormSection } from "@/components/form-section";
import { Button } from "@/components/ui/button";
import { perEngine } from "@/lib/engines";
import type { FormState } from "@/lib/form-state";

import type { FluidSetup } from "../../flights/fluid-fields";
import {
  ADD_FUEL_FIELD,
  ADD_OIL_FIELDS,
  ADD_REMAINING_FIELDS,
  ADD_RESET_FIELDS,
} from "../fields";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

// Each time fuel or oil goes in while the aircraft is out.  Blank is
// none.  Fueling with totalizers asks what each showed and what it was
// reset to, so fuel used can be counted across the reset.
export function AddFluidForm({
  action,
  fluids: { totalizers, engines },
  expected,
}: {
  action: Action;
  fluids: FluidSetup;
  // What each totalizer should show now, if known.
  expected: (string | null)[];
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const values = state.values;
  const errors = state.fieldErrors ?? {};
  const field = (name: string, label: string, description?: string) => (
    <Field
      key={name}
      name={name}
      label={label}
      inputMode="decimal"
      autoComplete="off"
      placeholder={description}
      defaultValue={values?.[name]}
      errors={errors[name]}
    />
  );

  return (
    <form action={formAction} noValidate>
      <FormSection
        title="Add fuel or oil"
        description="Each time you add some, before or after flying. Leave blank what you didn't add."
      >
        <FormError message={state.error} />
        <div className="grid grid-cols-2 gap-3">
          {field(ADD_FUEL_FIELD, "Fuel added (gal)")}
          {ADD_OIL_FIELDS.slice(0, engines).map((name, i) =>
            field(name, `${perEngine("Oil added", engines, i)} (qt)`),
          )}
        </div>
        {totalizers > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {ADD_REMAINING_FIELDS.slice(0, totalizers).flatMap((name, i) => [
              field(
                name,
                `${perEngine("Totalizer before fueling", totalizers, i)} (gal)`,
                expected[i] === null
                  ? undefined
                  : `${Number(expected[i]).toFixed(1)} or less`,
              ),
              field(
                ADD_RESET_FIELDS[i],
                `${perEngine("Totalizer reset to", totalizers, i)} (gal)`,
              ),
            ])}
          </div>
        )}
        <Button
          type="submit"
          variant="outline"
          className="h-11 text-base"
          disabled={pending}
        >
          {pending ? "Adding…" : "Add fuel or oil"}
        </Button>
      </FormSection>
    </form>
  );
}

// Removing is for a typo: remove it and add it again.
export function RemoveEntry({
  action,
  description,
}: {
  action: Action;
  description: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button
        type="submit"
        variant="ghost"
        className="h-11 text-muted-foreground"
        aria-label={`Remove ${description}`}
        disabled={pending}
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
      <FormError message={state.error} />
    </form>
  );
}

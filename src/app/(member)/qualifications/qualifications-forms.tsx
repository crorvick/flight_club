"use client";

import { useActionState } from "react";

import { Field, FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/form-state";
import {
  MEDICAL_CLASSES,
  MEDICAL_LABELS,
  type MedicalClass,
} from "@/lib/qualifications";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const selectClass =
  "h-11 rounded-lg border border-input bg-transparent px-2 text-base";

export function QualificationsForm({
  action,
  initial,
}: {
  action: Action;
  initial: {
    medicalClass: MedicalClass | null;
    medicalExpiresOn: string | null;
    flightReviewOn: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const values = state.values;
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="medicalClass">Medical</Label>
          <select
            id="medicalClass"
            name="medicalClass"
            defaultValue={values?.medicalClass ?? initial.medicalClass ?? ""}
            className={selectClass}
          >
            <option value="">None on file</option>
            {MEDICAL_CLASSES.map((c) => (
              <option key={c} value={c}>
                {MEDICAL_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <Field
          name="medicalExpiresOn"
          label="Medical expires"
          type="date"
          defaultValue={
            values?.medicalExpiresOn ?? initial.medicalExpiresOn ?? ""
          }
          errors={errors.medicalExpiresOn}
        />
      </div>
      <Field
        name="flightReviewOn"
        label="Last flight review"
        type="date"
        defaultValue={values?.flightReviewOn ?? initial.flightReviewOn ?? ""}
        errors={errors.flightReviewOn}
      />
      <Button type="submit" className="h-11 text-base" disabled={pending}>
        {pending ? "Saving…" : "Save qualifications"}
      </Button>
    </form>
  );
}

export function CheckoutForm({
  action,
  fleet,
}: {
  action: Action;
  fleet: { id: string; tailNumber: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const values = state.values;
  const errors = state.fieldErrors ?? {};
  if (fleet.length === 0) return null;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-dashed p-4"
      noValidate
    >
      <FormError message={state.error} />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="checkoutAircraft">Checked out in</Label>
          <select
            id="checkoutAircraft"
            name="aircraftId"
            defaultValue={values?.aircraftId ?? fleet[0].id}
            className={selectClass}
          >
            {fleet.map((a) => (
              <option key={a.id} value={a.id}>
                {a.tailNumber}
              </option>
            ))}
          </select>
          {errors.aircraftId && (
            <p className="text-sm text-destructive">{errors.aircraftId[0]}</p>
          )}
        </div>
        <Field
          id="checkedOutOn"
          name="checkedOutOn"
          label="On"
          type="date"
          defaultValue={values?.checkedOutOn}
          errors={errors.checkedOutOn}
        />
      </div>
      <Button type="submit" className="h-11 text-base" disabled={pending}>
        {pending ? "Saving…" : "Record checkout"}
      </Button>
    </form>
  );
}

export function RemoveCheckout({
  action,
  tailNumber,
}: {
  action: Action;
  tailNumber: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return (
    <form action={formAction}>
      <FormError message={state.error} />
      <Button
        type="submit"
        variant="ghost"
        className="h-11 text-destructive"
        disabled={pending}
        aria-label={`Remove checkout in ${tailNumber}`}
      >
        Remove
      </Button>
    </form>
  );
}

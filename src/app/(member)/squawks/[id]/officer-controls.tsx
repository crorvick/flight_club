"use client";

import { useActionState } from "react";

import { FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/form-state";
import type { SquawkChange } from "@/lib/squawk-rules";

export function OfficerControls({
  action,
  allowed,
  grounds,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  allowed: SquawkChange[];
  grounds: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  if (allowed.length === 0) return null;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
      noValidate
    >
      <h2 className="text-base font-semibold">Officer</h2>
      <FormError message={state.error} />

      {allowed.includes("resolve") && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="note" className="text-base">
            What was done about it?
          </Label>
          <textarea
            id="note"
            name="note"
            rows={3}
            defaultValue={state.values?.note}
            aria-invalid={state.fieldErrors?.note ? true : undefined}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
          />
          {state.fieldErrors?.note && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.note[0]}
            </p>
          )}
          <Button
            type="submit"
            name="intent"
            value="resolve"
            className="h-11 text-base"
            disabled={pending}
          >
            {grounds ? "Resolve and return to service" : "Resolve"}
          </Button>
        </div>
      )}

      {allowed.includes("defer") && (
        <Button
          type="submit"
          name="intent"
          value="defer"
          variant="outline"
          className="h-11 text-base"
          disabled={pending}
        >
          Defer
        </Button>
      )}
      {allowed.includes("reopen") && (
        <Button
          type="submit"
          name="intent"
          value="reopen"
          variant="outline"
          className="h-11 text-base"
          disabled={pending}
        >
          Reopen
        </Button>
      )}
    </form>
  );
}

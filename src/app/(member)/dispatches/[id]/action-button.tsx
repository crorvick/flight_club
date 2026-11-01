"use client";

import { useActionState } from "react";

import { FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";

// A single button that runs a server action and shows its error, for
// actions with no fields: cancelling a dispatch, reviewing a gap.
export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "outline",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  pendingLabel: string;
  variant?: "outline" | "destructive";
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormError message={state.error} />
      <Button
        type="submit"
        variant={variant}
        className="h-11 text-base"
        disabled={pending}
      >
        {pending ? pendingLabel : label}
      </Button>
    </form>
  );
}

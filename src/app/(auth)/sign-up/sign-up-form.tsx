"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { signUp, type FormState } from "../actions";
import { Field, FormError } from "../field";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        name="name"
        label="Name"
        autoComplete="name"
        defaultValue={state.values?.name}
        errors={state.fieldErrors?.name}
        required
      />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
        required
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        errors={state.fieldErrors?.password}
        required
      />
      <Button type="submit" className="h-11 text-base" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

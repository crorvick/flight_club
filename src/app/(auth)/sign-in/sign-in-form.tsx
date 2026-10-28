"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { signIn, type FormState } from "../actions";
import { Field, FormError } from "../field";

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, {} as FormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
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
        autoComplete="current-password"
        errors={state.fieldErrors?.password}
        required
      />
      <Button type="submit" className="h-11 text-base" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

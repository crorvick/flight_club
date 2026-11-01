"use client";

import { useActionState } from "react";

import { FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";
import type { RoleTag } from "@/lib/roles";

const ROLE_LABELS: Record<RoleTag, { label: string; hint: string }> = {
  pilot: { label: "Pilot", hint: "Logs flights and reports squawks" },
  officer: {
    label: "Officer",
    hint: "Manages members and aircraft, resolves squawks",
  },
};

export function MemberForm({
  action,
  active,
  roles,
  self,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  active: boolean;
  roles: RoleTag[];
  self: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">Roles</legend>
        {(Object.keys(ROLE_LABELS) as RoleTag[]).map((role) => (
          <label
            key={role}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2"
          >
            <input
              type="checkbox"
              name="roles"
              value={role}
              defaultChecked={roles.includes(role)}
              className="size-5 accent-primary"
            />
            <span>
              <span className="block font-medium">
                {ROLE_LABELS[role].label}
              </span>
              <span className="block text-sm text-muted-foreground">
                {ROLE_LABELS[role].hint}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2">
        <input
          type="checkbox"
          name="active"
          defaultChecked={active}
          className="size-5 accent-primary"
        />
        <span>
          <span className="block font-medium">Active</span>
          <span className="block text-sm text-muted-foreground">
            {self
              ? "You can't deactivate yourself."
              : "Unchecked, they can sign in but do nothing."}
          </span>
        </span>
      </label>

      <Button type="submit" className="h-11 text-base" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

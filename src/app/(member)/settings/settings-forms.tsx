"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useActionState, useSyncExternalStore } from "react";

import { Field, FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";
import { applyTheme, readTheme, type Theme, THEME_KEY } from "@/lib/theme";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function NameForm({ action, name }: { action: Action; name: string }) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        name="name"
        label="Name"
        autoComplete="name"
        defaultValue={state.values?.name ?? name}
        errors={state.fieldErrors?.name}
      />
      <Button
        type="submit"
        variant="outline"
        className="h-11 self-start px-5 text-base"
        disabled={pending}
      >
        {pending ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}

export function PasswordForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        errors={errors.currentPassword}
      />
      <Field
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        errors={errors.newPassword}
      />
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="signOutOthers"
          defaultChecked={state.values?.signOutOthers === "on"}
          className="size-5 accent-primary"
        />
        <span>
          Sign out everywhere else{" "}
          <span className="text-sm text-muted-foreground">
            (other phones and computers)
          </span>
        </span>
      </label>
      <Button
        type="submit"
        variant="outline"
        className="h-11 self-start px-5 text-base"
        disabled={pending}
      >
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Match device", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

// Changes when this or another tab picks a theme.
function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("themechange", onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("themechange", onChange);
  };
}

// Applies straight away, on this device only.  The server can't know the
// choice, so it renders "Match device" and the browser corrects it.
export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system");
  const choose = (value: Theme) => {
    applyTheme(value);
    window.dispatchEvent(new Event("themechange"));
  };
  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className="flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-sm font-medium has-checked:border-primary has-checked:bg-primary/5 has-checked:ring-2 has-checked:ring-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => choose(value)}
              // Also on click: one tapped before the page hydrated is
              // already checked, so tapping it again fires no change.
              onClick={() => choose(value)}
              className="sr-only"
            />
            <Icon aria-hidden className="size-5" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

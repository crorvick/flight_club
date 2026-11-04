"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useActionState, useSyncExternalStore } from "react";

import { Field, FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";
import { PROVIDER_LABELS, type SocialProvider } from "@/lib/sign-in-methods";
import { applyTheme, readTheme, type Theme, THEME_KEY } from "@/lib/theme";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function NameForm({
  action,
  name,
  from,
}: {
  action: Action;
  name: string;
  // Where it's asked from, for where saving goes next.
  from?: "home";
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      {from && <input type="hidden" name="from" value={from} />}
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

// Email and phone, for officers and other members to reach them.  The
// password is only needed to change the email, which is also how they
// sign in.
export function ContactForm({
  action,
  email,
  phone,
  hasPassword,
}: {
  action: Action;
  email: string;
  phone: string;
  // Without one, changing the email waits until they set one.
  hasPassword: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email ?? email}
        errors={errors.email}
      />
      <Field
        name="phone"
        label="Phone (optional)"
        type="tel"
        autoComplete="tel"
        defaultValue={state.values?.phone ?? phone}
        errors={errors.phone}
      />
      {hasPassword ? (
        <Field
          name="password"
          label="Password, to change your email"
          type="password"
          autoComplete="current-password"
          errors={errors.password}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          To change your email, set a password below first.
        </p>
      )}
      <Button
        type="submit"
        variant="outline"
        className="h-11 self-start px-5 text-base"
        disabled={pending}
      >
        {pending ? "Saving…" : "Save contact details"}
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

// For a member who signs in only with Google or Apple.
export function SetPasswordForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        errors={state.fieldErrors?.newPassword}
      />
      <Button
        type="submit"
        variant="outline"
        className="h-11 self-start px-5 text-base"
        disabled={pending}
      >
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}

export type ProviderLink = {
  provider: SocialProvider;
  // Its account's id when linked.
  accountId?: string;
  // Link it, when it isn't and can be.
  link?: () => Promise<void>;
  unlink?: Action;
};

// Each of Google and Apple, linked or not.
export function LinkedAccounts({ links }: { links: ProviderLink[] }) {
  return (
    <ul className="flex flex-col divide-y">
      {links.map((link) => (
        <li
          key={link.provider}
          className="flex min-h-14 items-center justify-between gap-3 py-2"
        >
          <span>
            <span className="block font-medium">
              {PROVIDER_LABELS[link.provider]}
            </span>
            <span className="block text-sm text-muted-foreground">
              {link.accountId ? "Linked" : "Not linked"}
            </span>
          </span>
          {link.unlink ? (
            <UnlinkButton
              action={link.unlink}
              label={PROVIDER_LABELS[link.provider]}
            />
          ) : (
            link.link && (
              <form action={link.link}>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-11 px-4 text-base"
                >
                  Link {PROVIDER_LABELS[link.provider]}
                </Button>
              </form>
            )
          )}
        </li>
      ))}
    </ul>
  );
}

function UnlinkButton({ action, label }: { action: Action; label: string }) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button
        type="submit"
        variant="ghost"
        className="h-11 px-4 text-base"
        aria-label={`Unlink ${label}`}
        disabled={pending}
      >
        {pending ? "Unlinking…" : "Unlink"}
      </Button>
      <FormError message={state.error} />
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

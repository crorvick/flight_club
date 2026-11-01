"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { FormError } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkOutReading } from "@/lib/dispatch-rules";
import type { FormState } from "@/lib/form-state";
import { formatHours, parseHours } from "@/lib/hours";

import { ACK_FIELD, expectedField, VFR_ONLY_FIELD } from "../dispatches/fields";
import { outField } from "../flights/fields";

type Meter = { id: string; label: string; reading: string; billing: boolean };
type Squawk = { id: string; description: string; deferred: boolean };

export function CheckOutForm({
  action,
  tailNumber,
  meters,
  squawks,
  vfrOnly,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  tailNumber: string;
  meters: Meter[];
  squawks: Squawk[];
  // Limited to VFR by a squawk or overdue maintenance.
  vfrOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const values = state.values;
  // What's typed, for the live note about unlogged time.  The inputs stay
  // uncontrolled, so a reading typed before the page hydrates is kept;
  // this picks it up once it has, since no change event fired for it.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    setTyped(
      Object.fromEntries(
        meters.map((m) => [outField(m.id), String(data.get(outField(m.id)))]),
      ),
    );
  }, [meters]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-6"
      noValidate
    >
      <FormError message={state.error} />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">
          Confirm the meters
        </legend>
        <p className="text-sm text-muted-foreground">
          Check each against the panel. If one reads more, enter what it says;
          officers will account for the unlogged time.
        </p>
        {meters.map((m) => {
          const name = outField(m.id);
          const expected = parseHours(m.reading)!;
          const shown = formatHours(expected);
          const value = typed[name] ?? values?.[name] ?? shown;
          const check = checkOutReading(expected, parseHours(value));
          const error = state.fieldErrors?.[name]?.[0];
          return (
            <div key={m.id} className="flex flex-col gap-2">
              <input
                type="hidden"
                name={expectedField(m.id)}
                value={m.reading}
              />
              <Label htmlFor={name} className="text-base">
                {m.label} reads
                {m.billing && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                    billed
                  </span>
                )}
              </Label>
              <Input
                id={name}
                name={name}
                inputMode="decimal"
                autoComplete="off"
                defaultValue={values?.[name] ?? shown}
                onChange={(e) =>
                  setTyped((prev) => ({ ...prev, [name]: e.target.value }))
                }
                aria-invalid={error ? true : undefined}
                aria-describedby={`${name}-note`}
                className="h-11 text-lg tabular-nums md:text-lg"
              />
              <p
                id={`${name}-note`}
                aria-live="polite"
                className={
                  error || check.status === "invalid"
                    ? "text-sm text-destructive"
                    : "text-sm font-medium text-amber-700 dark:text-amber-400"
                }
              >
                {error ??
                  (check.status === "invalid"
                    ? check.message
                    : check.gap > 0 &&
                      `${formatHours(check.gap)} hours more than last logged (${shown}).`)}
              </p>
            </div>
          );
        })}
      </fieldset>

      {squawks.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-lg font-semibold">Open squawks</legend>
          {squawks.map((s) => (
            <label
              key={s.id}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border px-3 py-3"
            >
              <input
                type="checkbox"
                name={ACK_FIELD}
                value={s.id}
                required
                className="mt-0.5 size-5 shrink-0 accent-primary"
              />
              <span>
                {s.description}
                <span className="block text-sm text-muted-foreground">
                  {s.deferred ? "Deferred" : "Open"} · I&apos;ve read this
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {vfrOnly && (
        <div className="flex flex-col gap-1">
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-amber-600/50 px-3 py-2">
            <input
              type="checkbox"
              name={VFR_ONLY_FIELD}
              required
              className="size-5 shrink-0 accent-primary"
            />
            <span className="font-medium">I&apos;ll fly VFR only</span>
          </label>
          {state.fieldErrors?.[VFR_ONLY_FIELD] && (
            <p className="text-sm text-destructive">
              {state.fieldErrors[VFR_ONLY_FIELD][0]}
            </p>
          )}
        </div>
      )}

      <Button type="submit" className="h-12 text-base" disabled={pending}>
        {pending ? "Checking out…" : `Check out ${tailNumber}`}
      </Button>
    </form>
  );
}

import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldProps = ComponentProps<typeof Input> & {
  name: string;
  label: string;
  errors?: string[];
};

// A labelled input sized for thumbs: 44px tall, and 16px text so iOS
// doesn't zoom in on focus.  The id defaults to the name; pass one when a
// page has several forms with the same field names.
export function Field({ id, name, label, errors, ...props }: FieldProps) {
  const inputId = id ?? name;
  const errorId = `${inputId}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        name={name}
        className="h-11 text-base md:text-base"
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? errorId : undefined}
        {...props}
      />
      {errors && (
        <p id={errorId} className="text-sm text-destructive">
          {errors[0]}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

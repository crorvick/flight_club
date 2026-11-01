import { cn } from "cn";

// A group of fields on a card, numbered when a form is a sequence of
// steps (confirm the meters, then the squawks), so a long form on a
// phone reads as a few short ones.
export function FormSection({
  step,
  title,
  description,
  className,
  children,
}: {
  step?: number;
  title: string;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // The card is a wrapper: a fieldset's own border would run through
    // its legend.
    <div className={cn("rounded-xl border bg-card p-4 sm:p-5", className)}>
      <fieldset className="flex min-w-0 flex-col gap-4">
        <legend className="mb-4 flex items-center gap-2.5 text-base font-semibold">
          {step !== undefined && (
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            >
              {step}
            </span>
          )}
          {title}
        </legend>
        {description && (
          <p className="-mt-3 text-sm text-muted-foreground">{description}</p>
        )}
        {children}
      </fieldset>
    </div>
  );
}

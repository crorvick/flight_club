import { cn } from "cn";

// A titled block of a record or settings page, on a card, with room for
// an action beside the title.
export function SectionCard({
  title,
  description,
  action,
  className,
  children,
  ...props
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<"section">, "title">) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5",
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

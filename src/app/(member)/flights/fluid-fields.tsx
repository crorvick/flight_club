import { Field } from "@/components/field";
import { FormSection } from "@/components/form-section";
import { engineLabels, perEngine } from "@/lib/engines";
import { formatAmount } from "@/lib/fluids";

import { TOTALIZER_FIELDS } from "./fields";

export type FluidValues = {
  fuelAdded: string;
  oilAdded: string;
  oilAdded2: string;
  totalizerFuel: string;
  totalizerFuel2: string;
  fuelUsed: string;
  fuelUsed2: string;
};

// Which fuel and oil fields an aircraft's flights ask for: its
// totalizers, if any, and oil per engine.
export type FluidSetup = { totalizers: number; engines: number };

// At check-in, what was added while the aircraft was checked out, as
// decimal strings, and what each totalizer should show now.
export type AddedFluids = {
  count: number;
  fuel: string;
  oil: string[];
  totalizers: (string | null)[];
};

const OIL_FIELDS = ["oilAdded", "oilAdded2"] as const;
const USED_FIELDS = ["fuelUsed", "fuelUsed2"] as const;

const which = (count: number, index: number) =>
  engineLabels(count)[index].toLowerCase();

// Fuel and oil for a flight.  Checking in, the totals come from what was
// added while it was out (`added`), and only the totalizers' fuel
// remaining is asked for.  Otherwise, editing or adding a flight, the
// totals are entered here: every field required, 0 when nothing was
// added, except fuel used, which may not be known.
export function FluidFields({
  step,
  fluids: { totalizers, engines },
  added,
  values,
  initial,
  errors,
}: {
  // Its number, in a form of numbered steps.
  step?: number;
  fluids: FluidSetup;
  added?: AddedFluids;
  // What was typed before a failed submit, then the stored values.
  values?: Record<string, string>;
  initial?: Partial<FluidValues>;
  errors: Partial<Record<string, string[]>>;
}) {
  const value = (name: keyof FluidValues) => values?.[name] ?? initial?.[name];
  const remaining = TOTALIZER_FIELDS.slice(0, totalizers).map((name, i) => (
    <Field
      key={name}
      name={name}
      label={`${perEngine("Totalizer fuel remaining", totalizers, i)} (gal)`}
      inputMode="decimal"
      autoComplete="off"
      required
      defaultValue={value(name)}
      errors={errors[name]}
    />
  ));

  if (added) {
    const shows = added.totalizers
      .slice(0, totalizers)
      .map((reading, i) =>
        reading === null
          ? null
          : `The ${which(totalizers, i) ? `${which(totalizers, i)} ` : ""}totalizer should show ${formatAmount(reading, "gal")} or less.`,
      )
      .filter(Boolean)
      .join(" ");
    return (
      <FormSection step={step} title="Fuel and oil">
        <p>
          {added.count === 0
            ? "No fuel or oil added."
            : [
                `${formatAmount(added.fuel, "gal")} fuel`,
                ...added.oil
                  .slice(0, engines)
                  .map(
                    (q, i) =>
                      `${formatAmount(q, "qt")} oil${which(engines, i) ? ` (${which(engines, i)})` : ""}`,
                  ),
              ].join(", ") + " added."}{" "}
          <span className="text-sm text-muted-foreground">
            Add any more above before checking in.
          </span>
        </p>
        {totalizers > 0 && (
          <>
            {shows && <p className="text-sm text-muted-foreground">{shows}</p>}
            {remaining}
          </>
        )}
      </FormSection>
    );
  }

  return (
    <FormSection
      step={step}
      title="Fuel and oil"
      description="Enter 0 if none was added."
    >
      <div className="grid grid-cols-2 gap-3">
        <Field
          name="fuelAdded"
          label="Fuel added (gal)"
          inputMode="decimal"
          autoComplete="off"
          required
          defaultValue={value("fuelAdded")}
          errors={errors.fuelAdded}
        />
        {OIL_FIELDS.slice(0, engines).map((name, i) => (
          <Field
            key={name}
            name={name}
            label={`${perEngine("Oil added", engines, i)} (qt)`}
            inputMode="decimal"
            autoComplete="off"
            required
            defaultValue={value(name)}
            errors={errors[name]}
          />
        ))}
      </div>
      {totalizers > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {remaining}
          {USED_FIELDS.slice(0, totalizers).map((name, i) => (
            <Field
              key={name}
              name={name}
              label={`${perEngine("Fuel used", totalizers, i)} (gal, if known)`}
              inputMode="decimal"
              autoComplete="off"
              defaultValue={value(name)}
              errors={errors[name]}
            />
          ))}
        </div>
      )}
    </FormSection>
  );
}

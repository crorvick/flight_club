import { Field } from "@/components/field";
import { FormSection } from "@/components/form-section";

export type FluidValues = {
  fuelAdded: string;
  oilAdded: string;
  totalizerFuel: string;
};

// Fuel and oil added for a flight, and the totalizer's fuel remaining at
// the end of it for aircraft that have one.  Every field shown is
// required: 0 when nothing was added.
export function FluidFields({
  step,
  totalizer,
  values,
  initial,
  errors,
}: {
  // Its number, in a form of numbered steps.
  step?: number;
  totalizer: boolean;
  // What was typed before a failed submit, then the stored values.
  values?: Record<string, string>;
  initial?: Partial<FluidValues>;
  errors: Partial<Record<string, string[]>>;
}) {
  const value = (name: keyof FluidValues) => values?.[name] ?? initial?.[name];
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
        <Field
          name="oilAdded"
          label="Oil added (qt)"
          inputMode="decimal"
          autoComplete="off"
          required
          defaultValue={value("oilAdded")}
          errors={errors.oilAdded}
        />
      </div>
      {totalizer && (
        <Field
          name="totalizerFuel"
          label="Totalizer fuel remaining (gal)"
          inputMode="decimal"
          autoComplete="off"
          required
          defaultValue={value("totalizerFuel")}
          errors={errors.totalizerFuel}
        />
      )}
    </FormSection>
  );
}

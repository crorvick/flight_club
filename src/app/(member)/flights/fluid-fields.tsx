import { Field } from "@/components/field";
import { FormSection } from "@/components/form-section";
import { engineLabels } from "@/lib/engines";

export type FluidValues = {
  fuelAdded: string;
  oilAdded: string;
  oilAdded2: string;
  totalizerFuel: string;
};

// Which fuel and oil fields an aircraft's flights ask for: the totalizer,
// if it has one, and oil per engine.
export type FluidSetup = { totalizer: boolean; engines: number };

// Fuel and oil added for a flight, and the totalizer's fuel remaining at
// the end of it for aircraft that have one.  Every field shown is
// required: 0 when nothing was added.
export function FluidFields({
  step,
  fluids: { totalizer, engines },
  values,
  initial,
  errors,
}: {
  // Its number, in a form of numbered steps.
  step?: number;
  fluids: FluidSetup;
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
        {(["oilAdded", "oilAdded2"] as const)
          .slice(0, engines)
          .map((name, engine) => {
            const label = engineLabels(engines)[engine].toLowerCase();
            return (
              <Field
                key={name}
                name={name}
                label={label ? `Oil added, ${label} (qt)` : "Oil added (qt)"}
                inputMode="decimal"
                autoComplete="off"
                required
                defaultValue={value(name)}
                errors={errors[name]}
              />
            );
          })}
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

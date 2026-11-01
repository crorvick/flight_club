ALTER TABLE "aircraft" ADD COLUMN "has_fuel_totalizer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "flight" ADD COLUMN "fuel_added" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "flight" ADD COLUMN "oil_added" numeric(3, 1);--> statement-breakpoint
ALTER TABLE "flight" ADD COLUMN "totalizer_fuel" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_fluids_nonnegative" CHECK (coalesce("flight"."fuel_added", 0) >= 0
        and coalesce("flight"."oil_added", 0) >= 0
        and coalesce("flight"."totalizer_fuel", 0) >= 0);
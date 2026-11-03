CREATE TABLE "dispatch_fluid" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"recorded_by_id" uuid,
	"fuel_added" numeric(4, 1) NOT NULL,
	"oil_added" numeric(3, 1) NOT NULL,
	"oil_added_2" numeric(3, 1),
	"totalizer_remaining" numeric(4, 1),
	"totalizer_reset" numeric(4, 1),
	"totalizer_remaining_2" numeric(4, 1),
	"totalizer_reset_2" numeric(4, 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispatch_fluid_nonnegative" CHECK ("dispatch_fluid"."fuel_added" >= 0
        and "dispatch_fluid"."oil_added" >= 0
        and coalesce("dispatch_fluid"."oil_added_2", 0) >= 0
        and coalesce("dispatch_fluid"."totalizer_remaining", 0) >= 0
        and coalesce("dispatch_fluid"."totalizer_reset", 0) >= 0
        and coalesce("dispatch_fluid"."totalizer_remaining_2", 0) >= 0
        and coalesce("dispatch_fluid"."totalizer_reset_2", 0) >= 0),
	CONSTRAINT "dispatch_fluid_reset_complete" CHECK (("dispatch_fluid"."totalizer_remaining" is null) = ("dispatch_fluid"."totalizer_reset" is null)
        and ("dispatch_fluid"."totalizer_remaining_2" is null) = ("dispatch_fluid"."totalizer_reset_2" is null))
);
--> statement-breakpoint
ALTER TABLE "flight" DROP CONSTRAINT "flight_fluids_nonnegative";--> statement-breakpoint
ALTER TABLE "aircraft" ADD COLUMN "fuel_totalizers" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- An aircraft with a totalizer had the one; has_fuel_totalizer stays
-- until the release before this one is gone.
UPDATE "aircraft" SET "fuel_totalizers" = 1 WHERE "has_fuel_totalizer";--> statement-breakpoint
ALTER TABLE "dispatch" ADD COLUMN "totalizer_out" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "dispatch" ADD COLUMN "totalizer_out_2" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "flight" ADD COLUMN "totalizer_fuel_2" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "flight" ADD COLUMN "fuel_used" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "flight" ADD COLUMN "fuel_used_2" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "dispatch_fluid" ADD CONSTRAINT "dispatch_fluid_dispatch_id_dispatch_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_fluid" ADD CONSTRAINT "dispatch_fluid_recorded_by_id_member_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispatch_fluid_dispatch_idx" ON "dispatch_fluid" USING btree ("dispatch_id","created_at");--> statement-breakpoint
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_fuel_totalizers" CHECK ("aircraft"."fuel_totalizers" between 0 and "aircraft"."engine_count");--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_fluids_nonnegative" CHECK (coalesce("flight"."fuel_added", 0) >= 0
        and coalesce("flight"."oil_added", 0) >= 0
        and coalesce("flight"."oil_added_2", 0) >= 0
        and coalesce("flight"."totalizer_fuel", 0) >= 0
        and coalesce("flight"."totalizer_fuel_2", 0) >= 0
        and coalesce("flight"."fuel_used", 0) >= 0
        and coalesce("flight"."fuel_used_2", 0) >= 0);
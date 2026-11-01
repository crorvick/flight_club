CREATE TYPE "public"."maintenance_kind" AS ENUM('general', 'vor_check', 'oil_change');--> statement-breakpoint
ALTER TABLE "flight" DROP CONSTRAINT "flight_fluids_nonnegative";--> statement-breakpoint
ALTER TABLE "aircraft" ADD COLUMN "engine_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "flight" ADD COLUMN "oil_added_2" numeric(3, 1);--> statement-breakpoint
ALTER TABLE "maintenance_completion" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD COLUMN "kind" "maintenance_kind" DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_engine_count" CHECK ("aircraft"."engine_count" between 1 and 2);--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_fluids_nonnegative" CHECK (coalesce("flight"."fuel_added", 0) >= 0
        and coalesce("flight"."oil_added", 0) >= 0
        and coalesce("flight"."oil_added_2", 0) >= 0
        and coalesce("flight"."totalizer_fuel", 0) >= 0);--> statement-breakpoint
-- Items already set up for these, going by their names; officers can
-- change any that guessed wrong.
UPDATE "maintenance_item" SET "kind" = 'vor_check' WHERE "name" ILIKE '%VOR check%';--> statement-breakpoint
UPDATE "maintenance_item" SET "kind" = 'oil_change' WHERE "name" ILIKE '%oil change%';

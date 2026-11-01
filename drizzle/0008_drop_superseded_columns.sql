-- A squawk or item written by the release before grounding levels has
-- only the old flag; make sure its level says the same before the flag
-- goes.
UPDATE "squawk" SET "grounding" = 'all' WHERE "grounding" = 'none' AND "grounds";--> statement-breakpoint
UPDATE "maintenance_item" SET "grounding" = 'all' WHERE "grounding" = 'none' AND "grounds_when_overdue";--> statement-breakpoint
ALTER TABLE "flight" DROP CONSTRAINT "flight_landings_nonnegative";--> statement-breakpoint
ALTER TABLE "flight" DROP COLUMN "day_landings";--> statement-breakpoint
ALTER TABLE "flight" DROP COLUMN "night_landings";--> statement-breakpoint
ALTER TABLE "maintenance_item" DROP COLUMN "grounds_when_overdue";--> statement-breakpoint
ALTER TABLE "squawk" DROP COLUMN "grounds";
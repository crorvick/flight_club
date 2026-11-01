-- Hours intervals count on the aircraft's logbook meter (0010), which
-- every release now running reads instead.
ALTER TABLE "maintenance_item" DROP CONSTRAINT "maintenance_item_hours_complete";--> statement-breakpoint
ALTER TABLE "maintenance_item" DROP CONSTRAINT "maintenance_item_meter_fk";
--> statement-breakpoint
ALTER TABLE "maintenance_item" DROP COLUMN "meter_id";--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD CONSTRAINT "maintenance_item_hours_complete" CHECK ("maintenance_item"."interval_hours" is null
        or ("maintenance_item"."interval_hours" > 0
          and "maintenance_item"."last_completed_reading" is not null));
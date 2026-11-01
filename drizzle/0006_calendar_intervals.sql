ALTER TABLE "maintenance_item" DROP CONSTRAINT "maintenance_item_months_complete";--> statement-breakpoint
ALTER TABLE "maintenance_item" DROP CONSTRAINT "maintenance_item_has_interval";--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD COLUMN "interval_days" integer;--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD COLUMN "due_end_of_month" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD CONSTRAINT "maintenance_item_one_calendar_interval" CHECK ("maintenance_item"."interval_months" is null or "maintenance_item"."interval_days" is null);--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD CONSTRAINT "maintenance_item_days_positive" CHECK ("maintenance_item"."interval_days" is null or "maintenance_item"."interval_days" > 0);--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD CONSTRAINT "maintenance_item_calendar_complete" CHECK (("maintenance_item"."interval_months" is null and "maintenance_item"."interval_days" is null)
        or "maintenance_item"."last_completed_on" is not null);--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD CONSTRAINT "maintenance_item_has_interval" CHECK ("maintenance_item"."interval_months" is not null
        or "maintenance_item"."interval_days" is not null
        or "maintenance_item"."interval_hours" is not null);
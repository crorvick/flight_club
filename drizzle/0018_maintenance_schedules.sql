CREATE TYPE "public"."directive_scope" AS ENUM('airframe', 'engine', 'propeller', 'appliance');--> statement-breakpoint
CREATE TYPE "public"."maintenance_schedule" AS ENUM('recurring', 'once', 'expires');--> statement-breakpoint
ALTER TYPE "public"."maintenance_kind" ADD VALUE 'hundred_hour';--> statement-breakpoint
ALTER TYPE "public"."maintenance_kind" ADD VALUE 'airworthiness_directive';--> statement-breakpoint
ALTER TYPE "public"."maintenance_kind" ADD VALUE 'service_bulletin';--> statement-breakpoint
ALTER TYPE "public"."maintenance_kind" ADD VALUE 'nav_database';--> statement-breakpoint
ALTER TABLE "maintenance_item" DROP CONSTRAINT "maintenance_item_has_interval";--> statement-breakpoint
ALTER TABLE "maintenance_completion" ADD COLUMN "expires_on" date;--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD COLUMN "schedule" "maintenance_schedule" DEFAULT 'recurring' NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD COLUMN "due_reading" numeric(9, 2);--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD COLUMN "closed_on" date;--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD COLUMN "applies_to" "directive_scope";--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD COLUMN "not_applicable" text;--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD CONSTRAINT "maintenance_item_intervals_recur" CHECK ("maintenance_item"."schedule" = 'recurring'
        or ("maintenance_item"."interval_months" is null
          and "maintenance_item"."interval_days" is null
          and "maintenance_item"."interval_hours" is null));--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD CONSTRAINT "maintenance_item_once_due" CHECK ("maintenance_item"."schedule" <> 'once'
        or "maintenance_item"."not_applicable" is not null
        or "maintenance_item"."due_on" is not null
        or "maintenance_item"."due_reading" is not null);--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD CONSTRAINT "maintenance_item_expires_due" CHECK ("maintenance_item"."schedule" <> 'expires'
        or "maintenance_item"."not_applicable" is not null
        or "maintenance_item"."due_on" is not null);--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD CONSTRAINT "maintenance_item_due_reading_once" CHECK ("maintenance_item"."due_reading" is null or "maintenance_item"."schedule" = 'once');--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD CONSTRAINT "maintenance_item_has_interval" CHECK ("maintenance_item"."schedule" <> 'recurring'
        or "maintenance_item"."not_applicable" is not null
        or "maintenance_item"."interval_months" is not null
        or "maintenance_item"."interval_days" is not null
        or "maintenance_item"."interval_hours" is not null);
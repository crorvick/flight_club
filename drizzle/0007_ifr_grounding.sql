CREATE TYPE "public"."grounding" AS ENUM('none', 'ifr', 'all');--> statement-breakpoint
ALTER TABLE "dispatch" ADD COLUMN "vfr_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD COLUMN "grounding" "grounding" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "squawk" ADD COLUMN "grounding" "grounding" DEFAULT 'none' NOT NULL;--> statement-breakpoint
-- Until now a squawk or item either grounded the aircraft or didn't.
UPDATE "squawk" SET "grounding" = 'all' WHERE "grounds";--> statement-breakpoint
UPDATE "maintenance_item" SET "grounding" = 'all' WHERE "grounds_when_overdue";

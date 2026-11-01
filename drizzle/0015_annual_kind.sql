-- Adds 'annual' by rebuilding the type rather than ALTER TYPE ... ADD
-- VALUE: the migrator runs every pending migration in one transaction,
-- and a value added that way can't be used until it commits, so the
-- items below couldn't be set to it.
ALTER TYPE "public"."maintenance_kind" RENAME TO "maintenance_kind_old";--> statement-breakpoint
CREATE TYPE "public"."maintenance_kind" AS ENUM('general', 'annual', 'vor_check', 'oil_change');--> statement-breakpoint
ALTER TABLE "maintenance_item" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "maintenance_item" ALTER COLUMN "kind" SET DATA TYPE "public"."maintenance_kind" USING "kind"::text::"public"."maintenance_kind";--> statement-breakpoint
ALTER TABLE "maintenance_item" ALTER COLUMN "kind" SET DEFAULT 'general';--> statement-breakpoint
DROP TYPE "public"."maintenance_kind_old";--> statement-breakpoint
-- Items already set up as annuals, going by their names.
UPDATE "maintenance_item" SET "kind" = 'annual' WHERE "kind" = 'general' AND "name" ILIKE '%annual%';

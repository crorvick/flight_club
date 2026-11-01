CREATE TABLE "squawk_photo" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"squawk_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "squawk_photo_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "squawk_photo" ADD CONSTRAINT "squawk_photo_squawk_id_squawk_id_fk" FOREIGN KEY ("squawk_id") REFERENCES "public"."squawk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "squawk_photo_squawk_idx" ON "squawk_photo" USING btree ("squawk_id");
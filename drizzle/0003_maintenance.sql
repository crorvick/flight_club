CREATE TABLE "maintenance_completion" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"completed_on" date NOT NULL,
	"reading" numeric(9, 2),
	"note" text,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_item" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"name" text NOT NULL,
	"interval_months" integer,
	"interval_hours" numeric(9, 2),
	"meter_id" uuid,
	"last_completed_on" date,
	"last_completed_reading" numeric(9, 2),
	"grounds_when_overdue" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_item_has_interval" CHECK ("maintenance_item"."interval_months" is not null or "maintenance_item"."interval_hours" is not null),
	CONSTRAINT "maintenance_item_months_positive" CHECK ("maintenance_item"."interval_months" is null or "maintenance_item"."interval_months" > 0),
	CONSTRAINT "maintenance_item_hours_complete" CHECK (("maintenance_item"."interval_hours" is null) = ("maintenance_item"."meter_id" is null)
        and ("maintenance_item"."interval_hours" is null
          or ("maintenance_item"."interval_hours" > 0
            and "maintenance_item"."last_completed_reading" is not null))),
	CONSTRAINT "maintenance_item_months_complete" CHECK ("maintenance_item"."interval_months" is null or "maintenance_item"."last_completed_on" is not null)
);
--> statement-breakpoint
ALTER TABLE "maintenance_completion" ADD CONSTRAINT "maintenance_completion_item_id_maintenance_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."maintenance_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_completion" ADD CONSTRAINT "maintenance_completion_recorded_by_id_member_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD CONSTRAINT "maintenance_item_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_item" ADD CONSTRAINT "maintenance_item_meter_fk" FOREIGN KEY ("meter_id","aircraft_id") REFERENCES "public"."meter"("id","aircraft_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_completion_item_idx" ON "maintenance_completion" USING btree ("item_id","completed_on");--> statement-breakpoint
CREATE INDEX "maintenance_item_aircraft_idx" ON "maintenance_item" USING btree ("aircraft_id");
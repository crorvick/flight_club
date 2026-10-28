CREATE TYPE "public"."meter_kind" AS ENUM('tach', 'hobbs', 'air_time');--> statement-breakpoint
CREATE TYPE "public"."squawk_category" AS ENUM('engine', 'avionics', 'airframe', 'other');--> statement-breakpoint
CREATE TYPE "public"."squawk_status" AS ENUM('open', 'deferred', 'resolved');--> statement-breakpoint
CREATE TABLE "aircraft" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"tail_number" text NOT NULL,
	"make_model" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"billing_meter_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aircraft_tail_number_unique" UNIQUE("tail_number")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"pilot_id" uuid NOT NULL,
	"date" date NOT NULL,
	"day_landings" integer DEFAULT 0 NOT NULL,
	"night_landings" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"billing_meter_kind" "meter_kind" NOT NULL,
	"billed_hours" numeric(9, 2) NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_landings_nonnegative" CHECK ("flight"."day_landings" >= 0 and "flight"."night_landings" >= 0),
	CONSTRAINT "flight_billed_hours_positive" CHECK ("flight"."billed_hours" > 0)
);
--> statement-breakpoint
CREATE TABLE "flight_meter_reading" (
	"flight_id" uuid NOT NULL,
	"meter_id" uuid NOT NULL,
	"out" numeric(9, 2) NOT NULL,
	"in" numeric(9, 2) NOT NULL,
	CONSTRAINT "flight_meter_reading_flight_id_meter_id_pk" PRIMARY KEY("flight_id","meter_id"),
	CONSTRAINT "flight_meter_reading_in_after_out" CHECK ("flight_meter_reading"."in" > "flight_meter_reading"."out")
);
--> statement-breakpoint
CREATE TABLE "meter" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"kind" "meter_kind" NOT NULL,
	"label" text NOT NULL,
	"current_reading" numeric(9, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meter_aircraft_kind_unique" UNIQUE("aircraft_id","kind"),
	CONSTRAINT "meter_id_aircraft_unique" UNIQUE("id","aircraft_id"),
	CONSTRAINT "meter_reading_nonnegative" CHECK ("meter"."current_reading" >= 0)
);
--> statement-breakpoint
CREATE TABLE "squawk" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"reported_by_id" uuid NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"category" "squawk_category" DEFAULT 'other' NOT NULL,
	"grounds" boolean NOT NULL,
	"status" "squawk_status" DEFAULT 'open' NOT NULL,
	"resolved_by_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "squawk_resolution_complete" CHECK (case when "squawk"."status" = 'resolved'
        then "squawk"."resolved_by_id" is not null
          and "squawk"."resolved_at" is not null
          and "squawk"."resolution_note" is not null
        else "squawk"."resolved_by_id" is null
          and "squawk"."resolved_at" is null
          and "squawk"."resolution_note" is null
      end)
);
--> statement-breakpoint
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_billing_meter_fk" FOREIGN KEY ("billing_meter_id","id") REFERENCES "public"."meter"("id","aircraft_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_member_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_pilot_id_member_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_meter_reading" ADD CONSTRAINT "flight_meter_reading_flight_id_flight_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flight"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_meter_reading" ADD CONSTRAINT "flight_meter_reading_meter_id_meter_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter" ADD CONSTRAINT "meter_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squawk" ADD CONSTRAINT "squawk_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squawk" ADD CONSTRAINT "squawk_reported_by_id_member_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squawk" ADD CONSTRAINT "squawk_resolved_by_id_member_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "flight_aircraft_date_idx" ON "flight" USING btree ("aircraft_id","date");--> statement-breakpoint
CREATE INDEX "flight_pilot_date_idx" ON "flight" USING btree ("pilot_id","date");--> statement-breakpoint
CREATE INDEX "flight_meter_reading_meter_idx" ON "flight_meter_reading" USING btree ("meter_id");--> statement-breakpoint
CREATE INDEX "squawk_unresolved_idx" ON "squawk" USING btree ("aircraft_id") WHERE "squawk"."status" <> 'resolved';
CREATE TYPE "public"."dispatch_status" AS ENUM('out', 'cancelled', 'in');--> statement-breakpoint
CREATE TABLE "dispatch" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"pilot_id" uuid NOT NULL,
	"status" "dispatch_status" DEFAULT 'out' NOT NULL,
	"checked_out_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_id" uuid,
	"flight_id" uuid,
	"gap_reviewed_at" timestamp with time zone,
	"gap_reviewed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispatch_flight_id_unique" UNIQUE("flight_id"),
	CONSTRAINT "dispatch_closed_complete" CHECK (("dispatch"."status" = 'out') = ("dispatch"."closed_at" is null)
        and ("dispatch"."status" = 'in') = ("dispatch"."flight_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "dispatch_meter_reading" (
	"dispatch_id" uuid NOT NULL,
	"meter_id" uuid NOT NULL,
	"expected" numeric(9, 2) NOT NULL,
	"out" numeric(9, 2) NOT NULL,
	CONSTRAINT "dispatch_meter_reading_dispatch_id_meter_id_pk" PRIMARY KEY("dispatch_id","meter_id"),
	CONSTRAINT "dispatch_meter_reading_nonnegative" CHECK ("dispatch_meter_reading"."out" >= 0)
);
--> statement-breakpoint
CREATE TABLE "dispatch_squawk_ack" (
	"dispatch_id" uuid NOT NULL,
	"squawk_id" uuid NOT NULL,
	CONSTRAINT "dispatch_squawk_ack_dispatch_id_squawk_id_pk" PRIMARY KEY("dispatch_id","squawk_id")
);
--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_pilot_id_member_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_closed_by_id_member_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_flight_id_flight_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flight"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_gap_reviewed_by_id_member_id_fk" FOREIGN KEY ("gap_reviewed_by_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_meter_reading" ADD CONSTRAINT "dispatch_meter_reading_dispatch_id_dispatch_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_meter_reading" ADD CONSTRAINT "dispatch_meter_reading_meter_id_meter_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_squawk_ack" ADD CONSTRAINT "dispatch_squawk_ack_dispatch_id_dispatch_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_squawk_ack" ADD CONSTRAINT "dispatch_squawk_ack_squawk_id_squawk_id_fk" FOREIGN KEY ("squawk_id") REFERENCES "public"."squawk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_one_out_per_aircraft" ON "dispatch" USING btree ("aircraft_id") WHERE "dispatch"."status" = 'out';--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_one_out_per_pilot" ON "dispatch" USING btree ("pilot_id") WHERE "dispatch"."status" = 'out';
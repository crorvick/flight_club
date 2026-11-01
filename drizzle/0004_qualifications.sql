CREATE TYPE "public"."medical_class" AS ENUM('first', 'second', 'third', 'basicmed');--> statement-breakpoint
CREATE TABLE "aircraft_checkout" (
	"member_id" uuid NOT NULL,
	"aircraft_id" uuid NOT NULL,
	"checked_out_on" date NOT NULL,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aircraft_checkout_member_id_aircraft_id_pk" PRIMARY KEY("member_id","aircraft_id")
);
--> statement-breakpoint
CREATE TABLE "pilot_qualification" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"medical_class" "medical_class",
	"medical_expires_on" date,
	"flight_review_on" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aircraft_checkout" ADD CONSTRAINT "aircraft_checkout_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aircraft_checkout" ADD CONSTRAINT "aircraft_checkout_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aircraft_checkout" ADD CONSTRAINT "aircraft_checkout_recorded_by_id_member_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_qualification" ADD CONSTRAINT "pilot_qualification_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;
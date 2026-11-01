CREATE TABLE "aircraft_captain" (
	"aircraft_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aircraft_captain_aircraft_id_member_id_pk" PRIMARY KEY("aircraft_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "aircraft_captain" ADD CONSTRAINT "aircraft_captain_aircraft_id_aircraft_id_fk" FOREIGN KEY ("aircraft_id") REFERENCES "public"."aircraft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aircraft_captain" ADD CONSTRAINT "aircraft_captain_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aircraft_captain_member_idx" ON "aircraft_captain" USING btree ("member_id");
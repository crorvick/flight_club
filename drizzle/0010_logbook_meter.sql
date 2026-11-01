ALTER TABLE "aircraft" ADD COLUMN "logbook_meter_id" uuid;--> statement-breakpoint
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_logbook_meter_fk" FOREIGN KEY ("logbook_meter_id","id") REFERENCES "public"."meter"("id","aircraft_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Hours intervals used to name their own meter.  The logbook meter is the
-- one most of an aircraft's items counted on, else its tach, else the
-- meter it's billed by.
UPDATE "aircraft" a SET "logbook_meter_id" = coalesce(
  (
    SELECT i."meter_id"
    FROM "maintenance_item" i JOIN "meter" m ON m."id" = i."meter_id"
    WHERE i."aircraft_id" = a."id"
    GROUP BY i."meter_id", m."kind"
    ORDER BY count(*) DESC, (m."kind" = 'tach') DESC
    LIMIT 1
  ),
  (SELECT m."id" FROM "meter" m WHERE m."aircraft_id" = a."id" AND m."kind" = 'tach'),
  a."billing_meter_id"
);--> statement-breakpoint
-- An item that counted on another meter moves to the logbook meter with
-- the hours it had left: its last-done reading shifts by the difference
-- between the two meters' current readings.
UPDATE "maintenance_item" i SET
  "last_completed_reading" = greatest(
    0, i."last_completed_reading" + (logbook."current_reading" - old."current_reading")
  ),
  "meter_id" = a."logbook_meter_id"
FROM "aircraft" a, "meter" logbook, "meter" old
WHERE a."id" = i."aircraft_id"
  AND logbook."id" = a."logbook_meter_id"
  AND old."id" = i."meter_id"
  AND i."meter_id" <> a."logbook_meter_id";

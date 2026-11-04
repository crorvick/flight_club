-- Annuals and VOR checks now take the interval their rule sets instead
-- of the one entered, so bring the ones already entered into line.  The
-- kinds added in 0019 can't have rows yet, and can't be named in the
-- same transaction that added them.
UPDATE "maintenance_item"
SET "interval_months" = 12, "interval_days" = NULL, "interval_hours" = NULL,
  "due_end_of_month" = true, "last_completed_reading" = NULL
WHERE "kind" = 'annual' AND "schedule" = 'recurring';--> statement-breakpoint
UPDATE "maintenance_item"
SET "interval_months" = NULL, "interval_days" = 30, "interval_hours" = NULL,
  "due_end_of_month" = false, "last_completed_reading" = NULL
WHERE "kind" = 'vor_check' AND "schedule" = 'recurring';

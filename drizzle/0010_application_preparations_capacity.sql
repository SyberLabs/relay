DROP TRIGGER IF EXISTS application_preparations_capacity;
--> statement-breakpoint
CREATE TRIGGER application_preparations_capacity BEFORE INSERT ON application_preparations
WHEN (SELECT COUNT(*) FROM application_preparations WHERE owner=NEW.owner)>=500 AND NOT EXISTS (SELECT 1 FROM application_preparations WHERE owner=NEW.owner AND job_id=NEW.job_id)
BEGIN SELECT RAISE(ABORT,'Application history storage limit reached'); END;

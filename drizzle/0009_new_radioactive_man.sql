CREATE TABLE `application_preparations` (
	`owner` text NOT NULL,
	`job_id` text NOT NULL,
	`actor` text NOT NULL,
	`job_version` integer NOT NULL,
	`destination` text NOT NULL,
	`fields` text NOT NULL,
	`files` text NOT NULL,
	`operation_id` text,
	`ready` integer NOT NULL,
	`armed_until` text NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`owner`, `job_id`)
);
--> statement-breakpoint
CREATE TRIGGER application_preparations_capacity BEFORE INSERT ON application_preparations
WHEN (SELECT COUNT(*) FROM application_preparations WHERE owner=NEW.owner)>=500
BEGIN SELECT RAISE(ABORT,'Application history storage limit reached'); END;
--> statement-breakpoint
CREATE TRIGGER application_preparations_payload_bound BEFORE INSERT ON application_preparations
WHEN length(CAST(NEW.fields AS BLOB))+length(CAST(NEW.files AS BLOB))>240000
BEGIN SELECT RAISE(ABORT,'Application evidence too large'); END;
--> statement-breakpoint
CREATE TRIGGER application_preparations_payload_bound_update BEFORE UPDATE ON application_preparations
WHEN length(CAST(NEW.fields AS BLOB))+length(CAST(NEW.files AS BLOB))>240000
BEGIN SELECT RAISE(ABORT,'Application evidence too large'); END;

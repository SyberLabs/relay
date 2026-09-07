CREATE TABLE `application_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`job_id` text NOT NULL,
	`job_version` integer NOT NULL,
	`policy_version` integer NOT NULL,
	`policy_snapshot` text NOT NULL,
	`actor` text NOT NULL,
	`manifest` text NOT NULL,
	`digest` text NOT NULL,
	`state` text NOT NULL,
	`authority` text NOT NULL,
	`created` text NOT NULL,
	`started` text,
	`finished` text,
	`receipt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `application_operations_owner_id` ON `application_operations` (`owner`,`id`);--> statement-breakpoint
CREATE INDEX `application_operations_owner_job` ON `application_operations` (`owner`,`job_id`);--> statement-breakpoint
CREATE TABLE `application_policies` (
	`owner` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`enabled` integer NOT NULL,
	`review` text NOT NULL,
	`jobs` text NOT NULL,
	`expires` text NOT NULL,
	`maximum` integer NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER application_operations_capacity BEFORE INSERT ON application_operations
WHEN (SELECT COUNT(*) FROM application_operations WHERE owner=NEW.owner)>=500
BEGIN SELECT RAISE(ABORT,'Application history storage limit reached'); END;
--> statement-breakpoint
CREATE TRIGGER application_operations_payload_bound BEFORE INSERT ON application_operations
WHEN length(CAST(NEW.manifest AS BLOB))>240000 OR length(CAST(NEW.policy_snapshot AS BLOB))>20000
BEGIN SELECT RAISE(ABORT,'Application evidence too large'); END;
--> statement-breakpoint
CREATE TRIGGER application_operations_immutable BEFORE UPDATE ON application_operations
WHEN NEW.id IS NOT OLD.id OR NEW.owner IS NOT OLD.owner OR NEW.job_id IS NOT OLD.job_id
 OR NEW.job_version IS NOT OLD.job_version OR NEW.policy_version IS NOT OLD.policy_version
 OR NEW.policy_snapshot IS NOT OLD.policy_snapshot OR NEW.actor IS NOT OLD.actor
 OR NEW.manifest IS NOT OLD.manifest OR NEW.digest IS NOT OLD.digest OR NEW.created IS NOT OLD.created
 OR (OLD.started IS NOT NULL AND NEW.started IS NOT OLD.started)
BEGIN SELECT RAISE(ABORT,'Application evidence is immutable'); END;

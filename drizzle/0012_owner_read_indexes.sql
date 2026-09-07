CREATE INDEX `events_owner_created` ON `events` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX `events_owner_job_created` ON `events` (`owner`,`job_id`,`created`);--> statement-breakpoint
CREATE INDEX `observations_owner_created` ON `observations` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX `jobs_owner_updated` ON `jobs` (`owner`,`updated`);

DROP INDEX `observations_owner_source`;--> statement-breakpoint
CREATE UNIQUE INDEX `observations_owner_source` ON `observations` (`owner`,`source_url`,`name`,`status`,`notes`);